// Movimientos de inventario (business_rules.md §1 a §4). HU-401: orden de retiro (OUT); HU-402: entrada (IN);
// HU-403: traslado entre almacenes (TRANSFER); HU-404: ajuste por conteo físico (ADJUST).
// Principios que se cumplen aquí:
//  - P3 Todo o nada: número de documento, cabecera, líneas y stock en una sola transacción.
//  - P4 Bloqueo de filas: las filas de stock se bloquean FOR UPDATE en orden ascendente de producto,
//    y la existencia se valida después del bloqueo, dentro de la transacción.
//  - P5 Sin stock negativo: si la suma de las líneas de un producto supera la existencia, no se registra nada.
//  - P6 Idempotencia: una solicitud repetida con el mismo Idempotency-Key devuelve el movimiento original.
// El rol mínimo (ALMACENISTA) lo exige la ruta; la regla de fechas por rol, este service.
import { createHash, randomUUID } from 'node:crypto';
import Decimal from 'decimal.js';
import { AppError } from '#src/shared/errors/AppError.js';
import { mapDatabaseError } from '#src/shared/errors/mapDatabaseError.js';
import { withTransaction } from '#src/shared/db/transaction.js';
import {
  ADJUSTMENT_KINDS,
  CORRECTION_REFERENCE_PREFIX,
  ENTRY_REASONS,
  MOVEMENT_REASONS,
  MOVEMENT_TYPES,
  OUT_REASONS_REQUIRING_ASSET,
  OUT_REASONS_REQUIRING_NOTE,
  REASONS_BY_TYPE,
  RECEIPT_DOCUMENT_PREFIXES,
  RECEIPT_FILE_MAX_BYTES,
  RECEIPT_FILE_MIME_TYPES,
} from '#src/shared/constants/movements.js';
import { ROLE_HIERARCHY } from '#src/shared/constants/roles.js';
import * as fileStorage from '#src/shared/storage/fileStorage.js';
import { assertWarehouseAvailable } from '#src/modules/warehouse/warehouse.service.js';
import { assertProductAvailable } from '#src/modules/product/product.service.js';
import { assertAssetAvailable } from '#src/modules/asset/asset.service.js';
import * as stockRepository from '#src/modules/stock/stock.repository.js';
import * as movementRepository from './movement.repository.js';
import { QUANTITY_DECIMALS, consolidateLines, requiredByProduct, resolveMovementDate, sortedIds } from './movement.rules.js';
import { toMovementDocumentDto, toMovementDto, toMovementSummaryDto, toPendingLoanDto } from './movement.dto.js';

const fieldIssue = (path, message) => ({ location: 'body', path, message });
const fixed = (value) => new Decimal(value).toFixed(QUANTITY_DECIMALS);

/**
 * Movimiento con sus correcciones (HU-406): qué movimientos lo corrigen (REV-{documento}), cuánto de
 * cada línea ya se corrigió y, si es una corrección, a cuál corrige.
 */
export const getMovement = async (id, { transaction } = {}) => {
  const movement = await movementRepository.findMovementById(id, { transaction });
  if (!movement) throw new AppError('NOT_FOUND', { message: `Movimiento ${id} no encontrado` });
  const [{ headers, corrected }, correctionOf] = await Promise.all([
    movementRepository.findCorrectionsOf(movement.documentNumber, { transaction }),
    movement.reference?.startsWith(CORRECTION_REFERENCE_PREFIX)
      ? movementRepository.findByDocumentNumber(movement.reference.slice(CORRECTION_REFERENCE_PREFIX.length), { transaction })
      : null,
  ]);
  return toMovementDto(movement, { corrections: headers, corrected, correctionOf });
};

/** Historial de movimientos (HU-408), del más reciente al más antiguo. Todos los roles lo consultan. */
export const listMovements = async (query) => {
  const { page, limit, search, ...rest } = query;
  const { items, total } = await movementRepository.listMovements(query);
  return {
    items: items.map(toMovementSummaryDto),
    total,
    page,
    limit,
    search: search ?? null,
    filters: Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)),
    sort: { field: 'movementDate', order: 'desc' },
  };
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
export const createWithdrawalOrder = async (input, { actor, idempotencyKey, correction } = {}) =>
  runIdempotent({ idempotencyKey, actor, emptyWarnings: { belowMinimum: [], consolidated: [] } }, async () => {
    assertWithdrawalShape(input);
    const movementDate = resolveMovementDate(input, actor);
    const lines = consolidateLines(input.lines);
    const required = requiredByProduct(lines);
    const productIds = sortedIds([...required.keys()]);
    const assetIds = sortedIds(lines.map((l) => l.assetId).filter(Boolean));

    const created = await withTransaction(async (transaction) => {
      // Corrección (HU-406): bloqueo y saldo por corregir del original, antes de tocar el stock.
      if (correction) await correction.inTransaction(transaction);
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
      // Una corrección lleva REV-{documento} y no consume el correlativo de referencias del almacén.
      const reference = correction
        ? correction.reference
        : withdrawalReference(warehouse, movementDate, await movementRepository.nextWithdrawalReferenceNumber(warehouse.id, movementDate.getFullYear(), { transaction }));

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
      return { id, belowMinimum: await findBelowMinimum(productIds, { transaction }) };
    });

    return { id: created.id, warnings: { belowMinimum: created.belowMinimum, consolidated: consolidatedWarning(lines) } };
  });

// --- Entrada (IN, HU-402) -----------------------------------------------------------------

/** 'AAAA-MM-DD' en la hora del servidor (las fechas de emisión son DATE, sin hora). */
const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Documentos de recepción (factura, vale, recibo…): el mismo tipo y número no se repite en la entrada,
 * y la fecha de emisión no puede ser futura. El formato lo valida el schema.
 */
const assertReceiptDocuments = (documents, now = new Date()) => {
  const seen = new Map();
  const issues = [];
  documents.forEach((doc, i) => {
    const key = `${doc.documentType}|${doc.documentNumber}`;
    if (seen.has(key)) issues.push(fieldIssue(`documents.${i}.documentNumber`, `Es el mismo documento ${seen.get(key) + 1}`));
    else seen.set(key, i);
    if (doc.issueDate && doc.issueDate > isoDay(now)) issues.push(fieldIssue(`documents.${i}.issueDate`, 'La fecha de emisión no puede ser futura'));
  });
  if (issues.length) {
    throw new AppError('VALIDATION_ERROR', { message: issues.length === 1 ? issues[0].message : 'Revise los documentos de recepción', details: issues });
  }
};

/** Referencia de la entrada: la escrita o, si no hay, la del primer documento (FAC-0012345). */
export const entryReference = (input) => {
  if (input.reference) return input.reference;
  const [first] = input.documents ?? [];
  return first ? `${RECEIPT_DOCUMENT_PREFIXES[first.documentType]}-${first.documentNumber}` : null;
};

/**
 * Reglas de la entrada que no necesitan la base de datos (business_rules.md §2.2 y §3).
 *  - Motivos COMPRA, DEVOLUCION y OTRO.
 *  - OTRO exige observación (naming_conventions.md §8.3).
 *  - DEVOLUCION (HU-405): cada línea indica el activo que devuelve (ASSET_REQUIRED) y no lleva
 *    documentos de recepción. Lo devuelto frente a lo pendiente se valida en la transacción.
 *  - En COMPRA y OTRO las líneas no llevan activo (trg_movement_lines_asset_rule lo prohíbe en COMPRA;
 *    en OTRO solo tiene sentido para las correcciones de consumo, HU-406).
 *  - Las referencias REV- son correcciones: solo ADMIN, desde el movimiento original (HU-406).
 */
const assertEntryShape = (input, { correction } = {}) => {
  if (!ENTRY_REASONS.includes(input.reason)) {
    const message = `Una entrada admite los motivos ${ENTRY_REASONS.join(', ')}`;
    throw new AppError('INVALID_MOVEMENT_REASON', { message, details: [fieldIssue('reason', message)] });
  }
  if (!input.lines.length) throw new AppError('EMPTY_MOVEMENT', { message: 'Agregue al menos una línea a la entrada' });
  if (input.reason === 'OTRO' && !input.note) {
    const message = 'Explique el motivo de la entrada';
    throw new AppError('VALIDATION_ERROR', { message, details: [fieldIssue('note', message)] });
  }
  if (!correction && input.reference?.startsWith(CORRECTION_REFERENCE_PREFIX)) {
    const message = 'Las correcciones (REV-) las registra un administrador desde el movimiento original';
    throw new AppError('VALIDATION_ERROR', { message, details: [fieldIssue('reference', message)] });
  }
  if (input.reason === MOVEMENT_REASONS.DEVOLUCION) {
    if (input.documents?.length) {
      const message = 'Una devolución no lleva documentos de recepción: indique el préstamo en la referencia';
      throw new AppError('VALIDATION_ERROR', { message, details: [fieldIssue('documents', message)] });
    }
    const missing = input.lines.map((line, i) => ({ line: i + 1, assetId: line.assetId })).filter((l) => !l.assetId);
    if (missing.length) {
      throw new AppError('ASSET_REQUIRED', {
        message: `En una devolución cada línea indica el activo que devuelve (línea ${missing.map((m) => m.line).join(', ')})`,
        details: missing.map((m) => ({ location: 'body', path: `lines.${m.line - 1}.assetId`, message: 'Indique el activo que devuelve', line: m.line })),
      });
    }
    return;
  }
  assertReceiptDocuments(input.documents ?? []);
  // Una corrección de consumo (IN OTRO) devuelve con el mismo activo: así se calcula el consumo neto (§5).
  const withAsset = correction ? [] : input.lines.map((line, i) => ({ line: i + 1, assetId: line.assetId })).filter((l) => l.assetId);
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
 * Devolución de préstamos (HU-405, business_rules.md §2.2 regla 3): lo devuelto por (activo, producto)
 * no puede superar lo pendiente = Σ OUT PRESTAMO − Σ IN DEVOLUCION. Se bloquean los préstamos de cada
 * activo (en orden ascendente) antes de leer el pendiente, así dos devoluciones simultáneas del mismo
 * activo esperan una a la otra y la segunda ve lo que ya devolvió la primera.
 * lines vienen consolidadas (una por activo y producto); sources indica sus líneas originales.
 */
const assertReturnWithinLoans = async (lines, products, { transaction }) => {
  const assetIds = sortedIds(lines.map((l) => l.assetId));
  await movementRepository.lockLoansOfAssets(assetIds, { transaction });
  const { pending, assetCodes } = await movementRepository.findPendingLoansOfAssets(assetIds, { transaction });
  const excess = lines
    .map((l) => ({ ...l, pending: new Decimal(pending.get(`${l.assetId}|${l.productId}`) ?? 0) }))
    .filter((l) => l.quantity.gt(l.pending));
  if (!excess.length) return;
  const describe = (l) => `${products.get(l.productId).code} para ${assetCodes.get(l.assetId) ?? `el activo ${l.assetId}`}`;
  const [first] = excess;
  throw new AppError('RETURN_EXCEEDS_LOAN', {
    message: first.pending.isZero()
      ? `No hay préstamo pendiente de ${describe(first)}`
      : `La devolución de ${describe(first)} supera lo prestado pendiente: pendiente ${fixed(first.pending)}, devuelto ${fixed(first.quantity)}`,
    details: excess.map((l) => ({
      location: 'body',
      path: `lines.${l.sources[0] - 1}.quantity`,
      line: l.sources[0],
      assetId: l.assetId,
      assetCode: assetCodes.get(l.assetId) ?? null,
      productId: l.productId,
      productCode: products.get(l.productId).code,
      pending: fixed(l.pending),
      requested: fixed(l.quantity),
    })),
  });
};

/** Préstamos pendientes de devolver (HU-405), uno por activo y producto, paginados. */
export const listPendingLoans = async (query) => {
  const { page, limit, assetId, movementId, search } = query;
  const { items, total } = await movementRepository.listPendingLoans(query);
  return {
    items: items.map(toPendingLoanDto),
    total,
    page,
    limit,
    search: search ?? null,
    filters: Object.fromEntries(Object.entries({ assetId, movementId }).filter(([, v]) => v !== undefined)),
    sort: { field: 'loanDate', order: 'asc' },
  };
};

/**
 * Entrada (IN, HU-402): suma existencias en el almacén de destino. Mismo esquema que la orden de
 * retiro: todo en una transacción, número ENT- sin huecos, idempotencia y regla de fechas por rol.
 * El stock se suma con INSERT … ON CONFLICT en orden ascendente de producto (P4): la fila se crea si
 * el producto nunca tuvo existencia en ese almacén (§2.2 regla 4).
 * Devuelve { movement, duplicated, warnings: { aboveMaximum, consolidated } }.
 */
export const createEntry = async (input, { actor, idempotencyKey, correction } = {}) =>
  runIdempotent({ idempotencyKey, actor, emptyWarnings: { aboveMaximum: [], consolidated: [] } }, async () => {
    assertEntryShape(input, { correction });
    const movementDate = resolveMovementDate(input, actor);
    const lines = consolidateLines(input.lines);
    const received = requiredByProduct(lines);
    const productIds = sortedIds([...received.keys()]);

    const created = await withTransaction(async (transaction) => {
      // Corrección (HU-406): bloqueo y saldo por corregir del original, antes de tocar el stock.
      if (correction) await correction.inTransaction(transaction);
      const warehouse = await assertWarehouseAvailable(input.warehouseId, { transaction, role: 'destino' });
      const products = new Map();
      for (const id of productIds) products.set(id, await assertProductAvailable(id, { transaction }));
      if (input.reason === MOVEMENT_REASONS.DEVOLUCION) await assertReturnWithinLoans(lines, products, { transaction });

      const documentNumber = await nextDocumentNumberOrFail(MOVEMENT_TYPES.IN, { transaction });
      const id = await movementRepository.createMovement(
        {
          documentNumber,
          movementType: MOVEMENT_TYPES.IN,
          reason: input.reason,
          reference: correction ? correction.reference : entryReference(input),
          workOrder: null,
          movementDate,
          createdByUserId: actor.id,
          warehouseFromId: null,
          warehouseToId: warehouse.id,
          receivedBy: input.receivedBy ?? null,
          note: input.note ?? null,
          idempotencyKey: idempotencyKey ?? null,
          lines: lines.map((l) => ({ productId: l.productId, assetId: l.assetId, quantity: fixed(l.quantity), note: l.note })),
          documents: (input.documents ?? []).map((doc) => ({
            documentType: doc.documentType,
            documentNumber: doc.documentNumber,
            supplierName: doc.supplierName,
            supplierTaxId: doc.supplierTaxId,
            issueDate: doc.issueDate,
            totalAmount: doc.totalAmount,
            currency: doc.currency,
          })),
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

// --- Traslado (TRANSFER, HU-403) -----------------------------------------------------------

/**
 * Reglas del traslado que no necesitan la base de datos (business_rules.md §2.4 y §3):
 * origen y destino distintos, al menos una línea y ningún activo en las líneas
 * (trg_movement_lines_asset_rule lo prohíbe en TRANSFER).
 */
const assertTransferShape = (input) => {
  if (input.warehouseFromId === input.warehouseToId) {
    const message = 'El almacén de destino debe ser distinto del de origen';
    throw new AppError('INVALID_MOVEMENT_WAREHOUSES', { message, details: [fieldIssue('warehouseToId', message)] });
  }
  if (!input.lines.length) throw new AppError('EMPTY_MOVEMENT', { message: 'Agregue al menos una línea al traslado' });
  const withAsset = input.lines.map((line, i) => ({ line: i + 1, assetId: line.assetId })).filter((l) => l.assetId);
  if (withAsset.length) {
    throw new AppError('ASSET_NOT_ALLOWED', {
      message: `Las líneas de un traslado no llevan activo (línea ${withAsset.map((l) => l.line).join(', ')})`,
      details: withAsset.map((l) => ({ location: 'body', path: `lines.${l.line - 1}.assetId`, message: 'Quite el activo', line: l.line })),
    });
  }
};

/**
 * Traslado (TRANSFER, HU-403): resta en el origen y suma en el destino en una sola transacción, sin
 * estado "en tránsito" (§2.4 regla 3). Valida la existencia del origen igual que la orden de retiro.
 *
 * Bloqueos (P4): el orden global es (almacén, producto) ascendente, el mismo que usan sin saberlo el
 * retiro y la entrada (un solo almacén, productos ascendentes). Por eso se procesa primero el almacén
 * de id menor: si es el destino, se suma antes de validar el origen (la transacción se revierte si
 * falta stock). Así dos traslados cruzados A→B y B→A esperan uno al otro en vez de bloquearse.
 * Devuelve { movement, duplicated, warnings: { consolidated } }.
 */
export const createTransfer = async (input, { actor, idempotencyKey, correction } = {}) =>
  runIdempotent({ idempotencyKey, actor, emptyWarnings: { consolidated: [] } }, async () => {
    assertTransferShape(input);
    const movementDate = resolveMovementDate(input, actor);
    const lines = consolidateLines(input.lines);
    const moved = requiredByProduct(lines);
    const productIds = sortedIds([...moved.keys()]);

    const createdId = await withTransaction(async (transaction) => {
      // Corrección (HU-406): bloqueo y saldo por corregir del original, antes de tocar el stock.
      if (correction) await correction.inTransaction(transaction);
      // Los almacenes se bloquean FOR SHARE también en orden ascendente de id.
      const [firstId, secondId] = sortedIds([input.warehouseFromId, input.warehouseToId]);
      const roleOf = (id) => (id === input.warehouseFromId ? 'origen' : 'destino');
      const first = await assertWarehouseAvailable(firstId, { transaction, role: roleOf(firstId) });
      const second = await assertWarehouseAvailable(secondId, { transaction, role: roleOf(secondId) });
      const from = first.id === input.warehouseFromId ? first : second;
      const to = from === first ? second : first;

      const products = new Map();
      for (const id of productIds) products.set(id, await assertProductAvailable(id, { transaction }));

      const addToDestination = async () => {
        for (const productId of productIds) {
          await stockRepository.incrementStock(to.id, productId, fixed(moved.get(productId)), { transaction });
        }
      };
      const takeFromOrigin = async () => {
        const stock = await stockRepository.lockStockRows(from.id, productIds, { transaction });
        const shortages = productIds
          .map((id) => ({ id, available: new Decimal(stock.get(id) ?? 0), requested: moved.get(id) }))
          .filter((s) => s.available.lt(s.requested));
        if (shortages.length) {
          const [firstShortage] = shortages;
          throw new AppError('INSUFFICIENT_STOCK', {
            message: `Stock insuficiente de ${products.get(firstShortage.id).code} en ${from.code}: disponible ${fixed(firstShortage.available)}, solicitado ${fixed(firstShortage.requested)}`,
            details: shortages.map((s) => ({
              productId: s.id,
              productCode: products.get(s.id).code,
              warehouseCode: from.code,
              available: fixed(s.available),
              requested: fixed(s.requested),
            })),
          });
        }
        for (const productId of productIds) {
          await stockRepository.decrementStock(from.id, productId, fixed(moved.get(productId)), { transaction });
        }
      };

      if (to.id < from.id) {
        await addToDestination();
        await takeFromOrigin();
      } else {
        await takeFromOrigin();
        await addToDestination();
      }

      const documentNumber = await nextDocumentNumberOrFail(MOVEMENT_TYPES.TRANSFER, { transaction });
      return movementRepository.createMovement(
        {
          documentNumber,
          movementType: MOVEMENT_TYPES.TRANSFER,
          reason: MOVEMENT_REASONS.TRASLADO,
          reference: correction?.reference ?? null,
          workOrder: null,
          movementDate,
          createdByUserId: actor.id,
          warehouseFromId: from.id,
          warehouseToId: to.id,
          receivedBy: input.receivedBy ?? null,
          note: input.note ?? null,
          idempotencyKey: idempotencyKey ?? null,
          lines: lines.map((l) => ({ productId: l.productId, assetId: null, quantity: fixed(l.quantity), note: l.note })),
        },
        { transaction }
      );
    });

    return { id: createdId, warnings: { consolidated: consolidatedWarning(lines) } };
  });

// --- Ajuste por conteo físico (ADJUST, HU-404) ----------------------------------------------

/**
 * Reglas del ajuste que no necesitan la base de datos (business_rules.md §2.5 y §3).
 *  - Solo ADMIN y SUPERADMIN (regla 1). La ruta ya lo exige; se repite aquí porque el asistente IA
 *    llama a este service sin pasar por la ruta.
 *  - El acta CF- no puede ser de un año posterior a la fecha del ajuste.
 *  - Al menos una línea y ninguna con activo (trg_movement_lines_asset_rule lo prohíbe en ADJUST).
 * La referencia CF- y la observación obligatorias las valida el schema (y los CHECK de la base).
 */
const assertAdjustmentShape = (input, actor, movementDate, { correction } = {}) => {
  if (actor.hierarchy > ROLE_HIERARCHY.ADMIN) {
    throw new AppError('FORBIDDEN_ROLE', { message: 'Solo un administrador registra ajustes por conteo físico' });
  }
  // Una corrección (REV-AJU-) no lleva acta CF-.
  const actaYear = correction ? 0 : Number(input.reference.slice(3, 7));
  if (actaYear > movementDate.getFullYear()) {
    const message = `El acta ${input.reference} es de un año posterior a la fecha del ajuste`;
    throw new AppError('VALIDATION_ERROR', { message, details: [fieldIssue('reference', message)] });
  }
  if (!input.lines.length) throw new AppError('EMPTY_MOVEMENT', { message: 'Agregue al menos una línea al ajuste' });
  const withAsset = input.lines.map((line, i) => ({ line: i + 1, assetId: line.assetId })).filter((l) => l.assetId);
  if (withAsset.length) {
    throw new AppError('ASSET_NOT_ALLOWED', {
      message: `Las líneas de un ajuste no llevan activo (línea ${withAsset.map((l) => l.line).join(', ')})`,
      details: withAsset.map((l) => ({ location: 'body', path: `lines.${l.line - 1}.assetId`, message: 'Quite el activo', line: l.line })),
    });
  }
};

/**
 * Ajuste por conteo físico (ADJUST, HU-404, business_rules.md §2.5). Un solo almacén:
 *  - SOBRANTE: warehouse_to_id, suma (crea la fila de stock si el producto no estaba).
 *  - FALTANTE: warehouse_from_id, resta con la fila bloqueada y sin dejar el stock negativo (P5).
 * Mismo esquema que los demás movimientos: una transacción, número AJU- sin huecos, idempotencia y
 * regla de fechas. Devuelve { movement, duplicated, warnings: { belowMinimum, aboveMaximum, consolidated } }.
 */
export const createAdjustment = async (input, { actor, idempotencyKey, correction } = {}) =>
  runIdempotent({ idempotencyKey, actor, emptyWarnings: { belowMinimum: [], aboveMaximum: [], consolidated: [] } }, async () => {
    const movementDate = resolveMovementDate(input, actor);
    assertAdjustmentShape(input, actor, movementDate, { correction });
    const lines = consolidateLines(input.lines);
    const adjusted = requiredByProduct(lines);
    const productIds = sortedIds([...adjusted.keys()]);
    const surplus = input.kind === ADJUSTMENT_KINDS.SOBRANTE;

    const created = await withTransaction(async (transaction) => {
      // Corrección (HU-406): bloqueo y saldo por corregir del original, antes de tocar el stock.
      if (correction) await correction.inTransaction(transaction);
      const warehouse = await assertWarehouseAvailable(input.warehouseId, { transaction, role: surplus ? 'destino' : 'origen' });
      const products = new Map();
      for (const id of productIds) products.set(id, await assertProductAvailable(id, { transaction }));

      if (surplus) {
        for (const productId of productIds) {
          await stockRepository.incrementStock(warehouse.id, productId, fixed(adjusted.get(productId)), { transaction });
        }
      } else {
        const stock = await stockRepository.lockStockRows(warehouse.id, productIds, { transaction });
        const shortages = productIds
          .map((id) => ({ id, available: new Decimal(stock.get(id) ?? 0), requested: adjusted.get(id) }))
          .filter((s) => s.available.lt(s.requested));
        if (shortages.length) {
          const [first] = shortages;
          throw new AppError('INSUFFICIENT_STOCK', {
            message: `El faltante de ${products.get(first.id).code} supera la existencia en ${warehouse.code}: registrada ${fixed(first.available)}, faltante ${fixed(first.requested)}`,
            details: shortages.map((s) => ({
              productId: s.id,
              productCode: products.get(s.id).code,
              warehouseCode: warehouse.code,
              available: fixed(s.available),
              requested: fixed(s.requested),
            })),
          });
        }
        for (const productId of productIds) {
          await stockRepository.decrementStock(warehouse.id, productId, fixed(adjusted.get(productId)), { transaction });
        }
      }

      const documentNumber = await nextDocumentNumberOrFail(MOVEMENT_TYPES.ADJUST, { transaction });
      const id = await movementRepository.createMovement(
        {
          documentNumber,
          movementType: MOVEMENT_TYPES.ADJUST,
          reason: MOVEMENT_REASONS.AJUSTE,
          reference: correction ? correction.reference : input.reference,
          workOrder: null,
          movementDate,
          createdByUserId: actor.id,
          warehouseFromId: surplus ? null : warehouse.id,
          warehouseToId: surplus ? warehouse.id : null,
          receivedBy: null,
          note: input.note,
          idempotencyKey: idempotencyKey ?? null,
          lines: lines.map((l) => ({ productId: l.productId, assetId: null, quantity: fixed(l.quantity), note: l.note })),
        },
        { transaction }
      );
      return {
        id,
        belowMinimum: surplus ? [] : await findBelowMinimum(productIds, { transaction }),
        aboveMaximum: surplus ? await findAboveMaximum(productIds, { transaction }) : [],
      };
    });

    return {
      id: created.id,
      warnings: { belowMinimum: created.belowMinimum, aboveMaximum: created.aboveMaximum, consolidated: consolidatedWarning(lines) },
    };
  });

// --- Corrección con un movimiento inverso (HU-406) -----------------------------------------

const lineKey = (productId, assetId) => `${productId}|${assetId ?? ''}`;

/**
 * Corrige un movimiento con su inverso (business_rules.md §5): los movimientos no se editan. Solo
 * ADMIN y SUPERADMIN. El inverso lleva la referencia REV-{documento} y reutiliza el registrador de su
 * tipo, con todas sus reglas (stock, fechas, idempotencia):
 *  - OUT → IN OTRO al mismo almacén y con el mismo activo (consumo neto, §5). Un PRESTAMO se corrige
 *    con IN DEVOLUCION, que baja lo pendiente y no puede superarlo.
 *  - IN  → OUT OTRO desde el mismo almacén, sin dejar stock negativo. Una DEVOLUCION se corrige con
 *    OUT PRESTAMO al mismo activo, que vuelve a dejar pendiente lo devuelto de más.
 *  - TRANSFER → TRANSFER de destino a origen.
 *  - ADJUST → ADJUST en el sentido contrario (REV-AJU-…).
 * input: { lines: [{ lineId, quantity }], note, movementDate? }. Por cada línea del original se corrige
 * como máximo lo que queda (cantidad original − lo ya corregido); dentro de la transacción del inverso
 * se bloquean las correcciones del original, así dos correcciones simultáneas no lo exceden.
 * Una corrección no se corrige: se registra otra sobre el original.
 */
export const createCorrection = async (movementId, input, { actor, idempotencyKey } = {}) => {
  if (actor.hierarchy > ROLE_HIERARCHY.ADMIN) {
    throw new AppError('FORBIDDEN_ROLE', { message: 'Solo un administrador registra correcciones' });
  }
  const original = await movementRepository.findMovementById(movementId);
  if (!original) throw new AppError('NOT_FOUND', { message: `Movimiento ${movementId} no encontrado` });
  if (original.reference?.startsWith(CORRECTION_REFERENCE_PREFIX)) {
    throw new AppError('CORRECTION_NOT_ALLOWED', {
      message: `${original.documentNumber} ya es una corrección de ${original.reference.slice(CORRECTION_REFERENCE_PREFIX.length)}: corrija el movimiento original`,
    });
  }
  if (!input.lines.length) throw new AppError('EMPTY_MOVEMENT', { message: 'Elija al menos una línea a corregir' });

  const byId = new Map(original.lines.map((l) => [l.id, l]));
  const seen = new Set();
  const issues = [];
  input.lines.forEach((l, i) => {
    if (!byId.has(l.lineId)) issues.push(fieldIssue(`lines.${i}.lineId`, `La línea ${l.lineId} no es de ${original.documentNumber}`));
    else if (seen.has(l.lineId)) issues.push(fieldIssue(`lines.${i}.lineId`, 'La línea está repetida'));
    seen.add(l.lineId);
  });
  if (issues.length) throw new AppError('VALIDATION_ERROR', { message: issues[0].message, details: issues });

  const date = input.movementDate ?? new Date();
  if (date < new Date(original.movementDate)) {
    const message = `La corrección no puede ser anterior a ${original.documentNumber}`;
    throw new AppError('MOVEMENT_DATE_INVALID', { message, details: [fieldIssue('movementDate', message)] });
  }

  const requested = input.lines.map((l, i) => ({ index: i, line: byId.get(l.lineId), quantity: new Decimal(l.quantity) }));
  const reference = `${CORRECTION_REFERENCE_PREFIX}${original.documentNumber}`;
  const correction = {
    reference,
    inTransaction: async (transaction) => {
      await movementRepository.lockCorrectionsOf(original.id, { transaction });
      const { corrected } = await movementRepository.findCorrectionsOf(original.documentNumber, { transaction });
      const excess = requested
        .map((r) => ({ ...r, available: new Decimal(r.line.quantity).minus(corrected.get(lineKey(r.line.product.id, r.line.asset?.id)) ?? 0) }))
        .filter((r) => r.quantity.gt(r.available));
      if (!excess.length) return;
      const [first] = excess;
      throw new AppError('CORRECTION_EXCEEDS_ORIGINAL', {
        message: `${first.line.product.code}${first.line.asset ? ` (${first.line.asset.code})` : ''}: queda por corregir ${fixed(first.available)}, se pidió ${fixed(first.quantity)}`,
        details: excess.map((r) => ({
          location: 'body',
          path: `lines.${r.index}.quantity`,
          lineId: r.line.id,
          productCode: r.line.product.code,
          available: fixed(r.available),
          requested: fixed(r.quantity),
        })),
      });
    },
  };

  const lines = requested.map((r) => ({ productId: r.line.product.id, assetId: r.line.asset?.id ?? null, quantity: fixed(r.quantity), note: null }));
  const common = { movementDate: input.movementDate, note: input.note, lines };
  const options = { actor, idempotencyKey, correction };
  switch (original.movementType) {
    case MOVEMENT_TYPES.OUT:
      return createEntry(
        {
          ...common,
          warehouseId: original.fromWarehouse.id,
          reason: original.reason === MOVEMENT_REASONS.PRESTAMO ? MOVEMENT_REASONS.DEVOLUCION : MOVEMENT_REASONS.OTRO,
          reference: null,
          documents: [],
          receivedBy: original.receivedBy ?? null,
        },
        options
      );
    case MOVEMENT_TYPES.IN:
      return createWithdrawalOrder(
        {
          ...common,
          warehouseId: original.toWarehouse.id,
          reason: original.reason === MOVEMENT_REASONS.DEVOLUCION ? MOVEMENT_REASONS.PRESTAMO : MOVEMENT_REASONS.OTRO,
          // Un préstamo exige quién lo tiene: el que devolvió de más (o, si no consta, el documento).
          receivedBy: original.receivedBy ?? `Corrección de ${original.documentNumber}`,
          workOrder: null,
        },
        options
      );
    case MOVEMENT_TYPES.TRANSFER:
      return createTransfer({ ...common, warehouseFromId: original.toWarehouse.id, warehouseToId: original.fromWarehouse.id, receivedBy: null }, options);
    case MOVEMENT_TYPES.ADJUST:
      return createAdjustment(
        {
          ...common,
          warehouseId: (original.toWarehouse ?? original.fromWarehouse).id,
          kind: original.toWarehouse ? ADJUSTMENT_KINDS.FALTANTE : ADJUSTMENT_KINDS.SOBRANTE,
          reference,
        },
        options
      );
    default:
      throw new AppError('CORRECTION_NOT_ALLOWED', { message: `Tipo de movimiento desconocido: ${original.movementType}` });
  }
};

// --- Archivo de un documento de recepción --------------------------------------------------

const DOCUMENT_FILES_AREA = 'receipt-documents';

/** Firma de cada tipo permitido: el Content-Type declarado debe coincidir con el contenido real. */
const FILE_SIGNATURES = {
  'application/pdf': (b) => b.subarray(0, 5).toString('latin1') === '%PDF-',
  'image/jpeg': (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
};

const findDocumentOrFail = async (movementId, documentId, options) => {
  const doc = await movementRepository.findDocument(movementId, documentId, options);
  if (!doc) throw new AppError('NOT_FOUND', { message: `Documento ${documentId} no encontrado en el movimiento ${movementId}` });
  return doc;
};

const alreadyAttached = (doc) => new AppError('DOCUMENT_FILE_EXISTS', { message: `El documento ${doc.documentNumber} ya tiene su archivo adjunto` });

/**
 * Adjunta el archivo escaneado (PDF o foto) a un documento de recepción. Solo quien registró la entrada
 * o un ADMIN o superior, y una sola vez: el documento es parte de un movimiento inmutable.
 * El archivo se escribe en disco antes de la transacción y se borra si la transacción falla.
 * file: { buffer, mimeType, originalName }. Devuelve el documento (DTO).
 */
export const attachDocumentFile = async (movementId, documentId, file, { actor }) => {
  const doc = await findDocumentOrFail(movementId, documentId);
  if (doc.header.createdByUserId !== actor.id && actor.hierarchy > ROLE_HIERARCHY.ADMIN) {
    throw new AppError('FORBIDDEN_ROLE', { message: 'Solo quien registró la entrada o un administrador adjunta sus documentos' });
  }
  if (doc.fileStorageKey) throw alreadyAttached(doc);

  const { buffer, mimeType, originalName } = file;
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new AppError('DOCUMENT_FILE_INVALID', { message: 'El archivo está vacío' });
  if (buffer.length > RECEIPT_FILE_MAX_BYTES) throw new AppError('DOCUMENT_FILE_TOO_LARGE');
  if (!Object.hasOwn(RECEIPT_FILE_MIME_TYPES, mimeType) || !FILE_SIGNATURES[mimeType](buffer)) {
    throw new AppError('DOCUMENT_FILE_INVALID', { message: 'El contenido del archivo no corresponde a un PDF, JPG, PNG o WEBP' });
  }

  const storageKey = `${randomUUID()}${RECEIPT_FILE_MIME_TYPES[mimeType]}`;
  await fileStorage.saveFile(DOCUMENT_FILES_AREA, storageKey, buffer);
  try {
    await withTransaction(async (transaction) => {
      // FOR UPDATE: dos subidas simultáneas al mismo documento no adjuntan dos archivos.
      const locked = await findDocumentOrFail(movementId, documentId, { transaction, lock: true });
      if (locked.fileStorageKey) throw alreadyAttached(locked);
      await movementRepository.attachDocumentFile(
        documentId,
        {
          fileStorageKey: storageKey,
          fileOriginalName: originalName,
          fileMimeType: mimeType,
          fileSizeBytes: buffer.length,
          fileSha256: createHash('sha256').update(buffer).digest('hex'),
          fileUploadedAt: new Date(),
          fileUploadedByUserId: actor.id,
        },
        { transaction }
      );
    });
  } catch (error) {
    await fileStorage.removeFile(DOCUMENT_FILES_AREA, storageKey);
    throw error;
  }
  return toMovementDocumentDto(await findDocumentOrFail(movementId, documentId));
};

/** Archivo de un documento para descargarlo: { buffer, mimeType, name }. Lo consultan todos los roles. */
export const getDocumentFile = async (movementId, documentId) => {
  const doc = await findDocumentOrFail(movementId, documentId);
  if (!doc.fileStorageKey) throw new AppError('NOT_FOUND', { message: `El documento ${doc.documentNumber} no tiene archivo adjunto` });
  const buffer = await fileStorage.readStoredFile(DOCUMENT_FILES_AREA, doc.fileStorageKey);
  // El registro existe pero el archivo no está en disco: falla del almacenamiento, no del cliente.
  if (!buffer) throw new AppError('INTERNAL_ERROR', { message: `Falta en disco el archivo ${doc.fileStorageKey}` });
  return { buffer, mimeType: doc.fileMimeType, name: doc.fileOriginalName, sha256: doc.fileSha256 };
};
