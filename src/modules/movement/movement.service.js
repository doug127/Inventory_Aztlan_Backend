// Movimientos de inventario (business_rules.md §1 a §4). HU-401: orden de retiro (OUT); HU-402: entrada (IN).
// Principios que se cumplen aquí:
//  - P3 Todo o nada: número de documento, cabecera, líneas y stock en una sola transacción.
//  - P4 Bloqueo de filas: las filas de stock se bloquean FOR UPDATE en orden ascendente de producto,
//    y la existencia se valida después del bloqueo, dentro de la transacción.
//  - P5 Sin stock negativo: si la suma de las líneas de un producto supera la existencia, no se registra nada.
//  - P6 Idempotencia: una solicitud repetida con el mismo Idempotency-Key devuelve el movimiento original.
// El rol mínimo (ALMACENISTA) lo exige la ruta; la regla de fechas por rol, este service.
import Decimal from 'decimal.js';
import { AppError } from '#src/shared/errors/AppError.js';
import { mapDatabaseError } from '#src/shared/errors/mapDatabaseError.js';
import { withTransaction } from '#src/shared/db/transaction.js';
import {
  CORRECTION_REFERENCE_PREFIX,
  ENTRY_REASONS,
  MOVEMENT_TYPES,
  OUT_REASONS_REQUIRING_ASSET,
  OUT_REASONS_REQUIRING_NOTE,
  REASONS_BY_TYPE,
} from '#src/shared/constants/movements.js';
import { assertWarehouseAvailable } from '#src/modules/warehouse/warehouse.service.js';
import { assertProductAvailable } from '#src/modules/product/product.service.js';
import { assertAssetAvailable } from '#src/modules/asset/asset.service.js';
import * as stockRepository from '#src/modules/stock/stock.repository.js';
import * as movementRepository from './movement.repository.js';
import { QUANTITY_DECIMALS, consolidateLines, requiredByProduct, resolveMovementDate, sortedIds } from './movement.rules.js';
import { toMovementDto } from './movement.dto.js';

const fieldIssue = (path, message) => ({ location: 'body', path, message });
const fixed = (value) => new Decimal(value).toFixed(QUANTITY_DECIMALS);

export const getMovement = async (id, { transaction } = {}) => {
  const movement = await movementRepository.findMovementById(id, { transaction });
  if (!movement) throw new AppError('NOT_FOUND', { message: `Movimiento ${id} no encontrado` });
  return toMovementDto(movement);
};

/** P6. La clave es de quien la usó primero: otro usuario con la misma clave recibe DUPLICATE_REQUEST. */
const findDuplicate = async (idempotencyKey, actor) => {
  if (!idempotencyKey) return null;
  const existing = await movementRepository.findByIdempotencyKey(idempotencyKey);
  if (!existing) return null;
  if (existing.createdByUserId !== actor.id) {
    throw new AppError('DUPLICATE_REQUEST', { message: 'Esa clave de idempotencia ya la usó otra solicitud' });
  }
  return existing.id;
};

/**
 * Referencia automática de la orden: {código del almacén}-{año de la fecha del movimiento}-{correlativo
 * de 6 dígitos por almacén y año}, por ejemplo TALL-2026-000001. Reemplaza a la referencia escrita
 * a mano en las órdenes de retiro.
 */
export const withdrawalReference = (warehouse, movementDate, number) => `${warehouse.code}-${movementDate.getFullYear()}-${String(number).padStart(6, '0')}`;

/** Reglas de la cabecera y de las líneas que no necesitan la base de datos (§2.3 y §3). */
const assertWithdrawalShape = (input) => {
  if (!REASONS_BY_TYPE.OUT.includes(input.reason)) {
    throw new AppError('INVALID_MOVEMENT_REASON', {
      message: `Una orden de retiro admite los motivos ${REASONS_BY_TYPE.OUT.join(', ')}`,
      details: [fieldIssue('reason', `Motivo no permitido: ${input.reason}`)],
    });
  }
  if (!input.lines.length) throw new AppError('EMPTY_MOVEMENT', { message: 'Agregue al menos una línea a la orden' });

  if (input.reason === 'PRESTAMO' && !input.receivedBy) {
    const message = 'Un préstamo exige indicar quién recibe y debe devolverlo';
    throw new AppError('VALIDATION_ERROR', { message, details: [fieldIssue('receivedBy', message)] });
  }
  if (OUT_REASONS_REQUIRING_NOTE.includes(input.reason) && !input.note) {
    const message = input.reason === 'DESECHO' ? 'Explique por qué se desecha (vencido, dañado, contaminado…)' : 'Explique el motivo del retiro';
    throw new AppError('VALIDATION_ERROR', { message, details: [fieldIssue('note', message)] });
  }
  if (OUT_REASONS_REQUIRING_ASSET.includes(input.reason)) {
    const missing = input.lines.map((line, i) => ({ line: i + 1, productId: line.productId, assetId: line.assetId })).filter((l) => !l.assetId);
    if (missing.length) {
      throw new AppError('ASSET_REQUIRED', {
        message: `Con motivo ${input.reason} cada línea indica el activo que recibe el producto (línea ${missing.map((m) => m.line).join(', ')})`,
        details: missing.map((m) => ({ location: 'body', path: `lines.${m.line - 1}.assetId`, message: 'Indique el activo destino', line: m.line })),
      });
    }
  }
};

/**
 * Productos que quedan bajo su mínimo (stock total de todos los almacenes, §7): aviso que no bloquea.
 * Se calcula dentro de la transacción, con el stock ya descontado.
 */
const findBelowMinimum = async (productIds, { transaction }) =>
  (await stockRepository.findStockTotals(productIds, { transaction }))
    .filter((row) => new Decimal(row.total).lt(row.minStock))
    .map((row) => ({ productId: row.productId, productCode: row.code, productName: row.name, unitCode: row.unitCode, total: fixed(row.total), minStock: fixed(row.minStock) }));

/**
 * P6. Si la clave ya se usó, devuelve el movimiento original. Si dos solicitudes con la misma clave
 * llegan a la vez, la segunda choca con el UNIQUE de idempotency_key y también devuelve la primera.
 * work() registra el movimiento y devuelve { id, warnings }.
 */
const runIdempotent = async ({ idempotencyKey, actor, emptyWarnings }, work) => {
  const duplicateOf = async () => {
    const id = await findDuplicate(idempotencyKey, actor);
    return id ? { movement: await getMovement(id), duplicated: true, warnings: emptyWarnings } : null;
  };
  const duplicate = await duplicateOf();
  if (duplicate) return duplicate;

  let created;
  try {
    created = await work();
  } catch (error) {
    if (idempotencyKey && (error instanceof AppError ? error.code : mapDatabaseError(error)?.code) === 'DUPLICATE_REQUEST') {
      const raced = await duplicateOf();
      if (raced) return raced;
    }
    throw error;
  }
  return { movement: await getMovement(created.id), duplicated: false, warnings: created.warnings };
};

const nextDocumentNumberOrFail = async (movementType, { transaction }) => {
  const documentNumber = await movementRepository.nextDocumentNumber(movementType, { transaction });
  if (!documentNumber) throw new AppError('INTERNAL_ERROR', { message: `Falta el contador de documentos de ${movementType} (document_sequences)` });
  return documentNumber;
};

/** Líneas de la solicitud con el mismo producto y activo que se sumaron en una sola. */
const consolidatedWarning = (lines) =>
  lines.filter((l) => l.sources.length > 1).map((l) => ({ productId: l.productId, assetId: l.assetId, lines: l.sources }));

/**
 * Orden de retiro (OUT, HU-401). input viene validado por el schema; actor es req.user.
 * Devuelve { movement, duplicated, warnings: { belowMinimum, consolidated } }.
 */
export const createWithdrawalOrder = async (input, { actor, idempotencyKey } = {}) =>
  runIdempotent({ idempotencyKey, actor, emptyWarnings: { belowMinimum: [], consolidated: [] } }, async () => {
    assertWithdrawalShape(input);
    const movementDate = resolveMovementDate(input, actor);
    const lines = consolidateLines(input.lines);
    const required = requiredByProduct(lines);
    const productIds = sortedIds([...required.keys()]);
    const assetIds = sortedIds(lines.map((l) => l.assetId).filter(Boolean));

    const created = await withTransaction(async (transaction) => {
      const warehouse = await assertWarehouseAvailable(input.warehouseId, { transaction, role: 'origen' });
      // FOR SHARE: nadie desactiva el producto ni el activo mientras se registra la orden.
      const products = new Map();
      for (const id of productIds) products.set(id, await assertProductAvailable(id, { transaction }));
      for (const id of assetIds) await assertAssetAvailable(id, { transaction });

      const stock = await stockRepository.lockStockRows(warehouse.id, productIds, { transaction });
      const shortages = productIds
        .map((id) => ({ id, available: new Decimal(stock.get(id) ?? 0), requested: required.get(id) }))
        .filter((s) => s.available.lt(s.requested));
      if (shortages.length) {
        const [first] = shortages;
        const product = products.get(first.id);
        throw new AppError('INSUFFICIENT_STOCK', {
          message: `Stock insuficiente de ${product.code} en ${warehouse.code}: disponible ${fixed(first.available)}, solicitado ${fixed(first.requested)}`,
          details: shortages.map((s) => ({
            productId: s.id,
            productCode: products.get(s.id).code,
            warehouseCode: warehouse.code,
            available: fixed(s.available),
            requested: fixed(s.requested),
          })),
        });
      }

      const documentNumber = await nextDocumentNumberOrFail(MOVEMENT_TYPES.OUT, { transaction });
      const referenceNumber = await movementRepository.nextWithdrawalReferenceNumber(warehouse.id, movementDate.getFullYear(), { transaction });

      const id = await movementRepository.createMovement(
        {
          documentNumber,
          movementType: MOVEMENT_TYPES.OUT,
          reason: input.reason,
          reference: withdrawalReference(warehouse, movementDate, referenceNumber),
          workOrder: input.workOrder ?? null,
          movementDate,
          createdByUserId: actor.id,
          warehouseFromId: warehouse.id,
          warehouseToId: null,
          receivedBy: input.receivedBy ?? null,
          note: input.note ?? null,
          idempotencyKey: idempotencyKey ?? null,
          lines: lines.map((l) => ({ productId: l.productId, assetId: l.assetId, quantity: fixed(l.quantity), note: l.note })),
        },
        { transaction }
      );
      for (const productId of productIds) {
        await stockRepository.decrementStock(warehouse.id, productId, fixed(required.get(productId)), { transaction });
      }
      return { id, belowMinimum: await findBelowMinimum(productIds, { transaction }) };
    });

    return { id: created.id, warnings: { belowMinimum: created.belowMinimum, consolidated: consolidatedWarning(lines) } };
  });

// --- Entrada (IN, HU-402) -----------------------------------------------------------------

/**
 * Reglas de la entrada que no necesitan la base de datos (business_rules.md §2.2 y §3).
 *  - Motivos COMPRA y OTRO. La DEVOLUCION de un préstamo llega con HU-405 (valida lo pendiente por activo).
 *  - OTRO exige observación (naming_conventions.md §8.3).
 *  - Las líneas no llevan activo (trg_movement_lines_asset_rule lo prohíbe en COMPRA; en OTRO solo
 *    tiene sentido para las correcciones de consumo, HU-406).
 *  - Las referencias REV- son correcciones: solo ADMIN, desde el movimiento original (HU-406).
 */
const assertEntryShape = (input) => {
  if (!ENTRY_REASONS.includes(input.reason)) {
    const message =
      input.reason === 'DEVOLUCION'
        ? 'Las devoluciones de préstamos se registran desde el préstamo pendiente (próximamente)'
        : `Una entrada admite los motivos ${ENTRY_REASONS.join(' y ')}`;
    throw new AppError('INVALID_MOVEMENT_REASON', { message, details: [fieldIssue('reason', message)] });
  }
  if (!input.lines.length) throw new AppError('EMPTY_MOVEMENT', { message: 'Agregue al menos una línea a la entrada' });
  if (input.reason === 'OTRO' && !input.note) {
    const message = 'Explique el motivo de la entrada';
    throw new AppError('VALIDATION_ERROR', { message, details: [fieldIssue('note', message)] });
  }
  if (input.reference?.startsWith(CORRECTION_REFERENCE_PREFIX)) {
    const message = 'Las correcciones (REV-) las registra un administrador desde el movimiento original';
    throw new AppError('VALIDATION_ERROR', { message, details: [fieldIssue('reference', message)] });
  }
  const withAsset = input.lines.map((line, i) => ({ line: i + 1, assetId: line.assetId })).filter((l) => l.assetId);
  if (withAsset.length) {
    throw new AppError('ASSET_NOT_ALLOWED', {
      message: `Las líneas de una entrada no llevan activo (línea ${withAsset.map((l) => l.line).join(', ')})`,
      details: withAsset.map((l) => ({ location: 'body', path: `lines.${l.line - 1}.assetId`, message: 'Quite el activo', line: l.line })),
    });
  }
};

/**
 * Productos que quedan por encima de su máximo (§7 regla 2): aviso que no bloquea. Se calcula dentro de
 * la transacción, con el stock ya sumado. Un producto sin máximo no avisa.
 */
const findAboveMaximum = async (productIds, { transaction }) =>
  (await stockRepository.findStockTotals(productIds, { transaction }))
    .filter((row) => row.maxStock !== null && new Decimal(row.total).gt(row.maxStock))
    .map((row) => ({ productId: row.productId, productCode: row.code, productName: row.name, unitCode: row.unitCode, total: fixed(row.total), maxStock: fixed(row.maxStock) }));

/**
 * Entrada (IN, HU-402): suma existencias en el almacén de destino. Mismo esquema que la orden de
 * retiro: todo en una transacción, número ENT- sin huecos, idempotencia y regla de fechas por rol.
 * El stock se suma con INSERT … ON CONFLICT en orden ascendente de producto (P4): la fila se crea si
 * el producto nunca tuvo existencia en ese almacén (§2.2 regla 4).
 * Devuelve { movement, duplicated, warnings: { aboveMaximum, consolidated } }.
 */
export const createEntry = async (input, { actor, idempotencyKey } = {}) =>
  runIdempotent({ idempotencyKey, actor, emptyWarnings: { aboveMaximum: [], consolidated: [] } }, async () => {
    assertEntryShape(input);
    const movementDate = resolveMovementDate(input, actor);
    const lines = consolidateLines(input.lines);
    const received = requiredByProduct(lines);
    const productIds = sortedIds([...received.keys()]);

    const created = await withTransaction(async (transaction) => {
      const warehouse = await assertWarehouseAvailable(input.warehouseId, { transaction, role: 'destino' });
      for (const id of productIds) await assertProductAvailable(id, { transaction });

      const documentNumber = await nextDocumentNumberOrFail(MOVEMENT_TYPES.IN, { transaction });
      const id = await movementRepository.createMovement(
        {
          documentNumber,
          movementType: MOVEMENT_TYPES.IN,
          reason: input.reason,
          reference: input.reference ?? null,
          workOrder: null,
          movementDate,
          createdByUserId: actor.id,
          warehouseFromId: null,
          warehouseToId: warehouse.id,
          receivedBy: input.receivedBy ?? null,
          note: input.note ?? null,
          idempotencyKey: idempotencyKey ?? null,
          lines: lines.map((l) => ({ productId: l.productId, assetId: null, quantity: fixed(l.quantity), note: l.note })),
        },
        { transaction }
      );
      for (const productId of productIds) {
        await stockRepository.incrementStock(warehouse.id, productId, fixed(received.get(productId)), { transaction });
      }
      return { id, aboveMaximum: await findAboveMaximum(productIds, { transaction }) };
    });

    return { id: created.id, warnings: { aboveMaximum: created.aboveMaximum, consolidated: consolidatedWarning(lines) } };
  });
