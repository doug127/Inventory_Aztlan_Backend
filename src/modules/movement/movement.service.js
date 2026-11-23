// Movimientos de inventario (business_rules.md §1 a §4). HU-401: orden de retiro (OUT).
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
 * Orden de retiro (OUT, HU-401). input viene validado por el schema; actor es req.user.
 * Devuelve { movement, duplicated, warnings: { belowMinimum, consolidated } }.
 */
export const createWithdrawalOrder = async (input, { actor, idempotencyKey } = {}) => {
  const duplicateId = await findDuplicate(idempotencyKey, actor);
  if (duplicateId) return { movement: await getMovement(duplicateId), duplicated: true, warnings: { belowMinimum: [], consolidated: [] } };

  assertWithdrawalShape(input);
  const movementDate = resolveMovementDate(input, actor);
  const lines = consolidateLines(input.lines);
  const required = requiredByProduct(lines);
  const productIds = sortedIds([...required.keys()]);
  const assetIds = sortedIds(lines.map((l) => l.assetId).filter(Boolean));

  let created;
  try {
    created = await withTransaction(async (transaction) => {
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

      const documentNumber = await movementRepository.nextDocumentNumber(MOVEMENT_TYPES.OUT, { transaction });
      const referenceNumber = await movementRepository.nextWithdrawalReferenceNumber(warehouse.id, movementDate.getFullYear(), { transaction });
      const reference = withdrawalReference(warehouse, movementDate, referenceNumber);
      if (!documentNumber) throw new AppError('INTERNAL_ERROR', { message: 'Falta el contador de documentos RET (document_sequences)' });

      const id = await movementRepository.createMovement(
        {
          documentNumber,
          movementType: MOVEMENT_TYPES.OUT,
          reason: input.reason,
          reference,
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
      const belowMinimum = await findBelowMinimum(productIds, { transaction });
      return { id, belowMinimum };
    });
  } catch (error) {
    // Dos solicitudes con la misma clave a la vez: la segunda choca con el UNIQUE y devuelve la primera.
    if (idempotencyKey && (error instanceof AppError ? error.code : mapDatabaseError(error)?.code) === 'DUPLICATE_REQUEST') {
      const existingId = await findDuplicate(idempotencyKey, actor);
      if (existingId) return { movement: await getMovement(existingId), duplicated: true, warnings: { belowMinimum: [], consolidated: [] } };
    }
    throw error;
  }

  return {
    movement: await getMovement(created.id),
    duplicated: false,
    warnings: {
      belowMinimum: created.belowMinimum,
      // Líneas de la solicitud con el mismo producto y activo que se sumaron en una sola.
      consolidated: lines.filter((l) => l.sources.length > 1).map((l) => ({ productId: l.productId, assetId: l.assetId, lines: l.sources })),
    },
  };
};
