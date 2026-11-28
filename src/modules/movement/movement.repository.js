// Movimientos (cabecera + líneas) y numeración de documentos (db_schema.md §4). No valida ni lanza
// errores de negocio: el service decide. Los movimientos son inmutables: aquí solo hay INSERT y SELECT.
import { QueryTypes, Transaction } from 'sequelize';
import { sequelize } from '#src/config/database.js';
import { Asset, AssetCategory, MovementDocument, MovementHeader, MovementLine, Product, Unit, User, Warehouse } from '#src/database/models/index.model.js';

const plain = (row) => (row ? row.get({ plain: true }) : null);
const WAREHOUSE_ATTRIBUTES = ['id', 'code', 'name'];

const DETAIL_INCLUDE = [
  { model: User, as: 'createdBy', attributes: ['id', 'fullName', 'username'] },
  { model: Warehouse, as: 'fromWarehouse', attributes: WAREHOUSE_ATTRIBUTES },
  { model: Warehouse, as: 'toWarehouse', attributes: WAREHOUSE_ATTRIBUTES },
  {
    model: MovementLine,
    as: 'lines',
    include: [
      { model: Product, as: 'product', attributes: ['id', 'code', 'name'], include: [{ model: Unit, as: 'unit', attributes: ['code', 'name'] }] },
      { model: Asset, as: 'asset', attributes: ['id', 'code', 'name'], include: [{ model: AssetCategory, as: 'category', attributes: ['id', 'code', 'name'] }] },
    ],
  },
  // Consulta aparte (separate): evita multiplicar las filas de las líneas por las de los documentos.
  {
    model: MovementDocument,
    as: 'documents',
    separate: true,
    order: [['id', 'ASC']],
    include: [{ model: User, as: 'fileUploadedBy', attributes: ['id', 'fullName'] }],
  },
];

/** Movimiento con sus líneas en el orden en que se registraron. */
export const findMovementById = async (id, { transaction } = {}) =>
  plain(
    await MovementHeader.findByPk(id, {
      include: DETAIL_INCLUDE,
      order: [[{ model: MovementLine, as: 'lines' }, 'id', 'ASC']],
      transaction,
    })
  );

/** Para la idempotencia (business_rules.md P6): id y creador del movimiento con esa clave. */
export const findByIdempotencyKey = async (idempotencyKey, { transaction } = {}) =>
  plain(await MovementHeader.findOne({ where: { idempotencyKey }, attributes: ['id', 'createdByUserId'], transaction }));

/**
 * Siguiente número de documento del tipo. UPDATE … RETURNING bloquea la fila del contador hasta el
 * commit: sin huecos ni duplicados, y un rollback devuelve el número (db_schema.md, document_sequences).
 */
export const nextDocumentNumber = async (movementType, { transaction }) => {
  const [row] = await sequelize.query(
    `UPDATE document_sequences SET last_number = last_number + 1
     WHERE movement_type = :movementType
     RETURNING prefix, last_number AS "lastNumber"`,
    { replacements: { movementType }, type: QueryTypes.SELECT, transaction }
  );
  return row ? `${row.prefix}-${String(row.lastNumber).padStart(6, '0')}` : null;
};

/**
 * Siguiente número de la referencia automática de las órdenes de retiro, por almacén y año
 * (TALL-2026-000001). INSERT … ON CONFLICT bloquea la fila hasta el commit: sin huecos ni repetidos.
 * El CHECK chk_withdrawal_reference_sequences_max corta en 999999.
 */
export const nextWithdrawalReferenceNumber = async (warehouseId, year, { transaction }) => {
  const [row] = await sequelize.query(
    `INSERT INTO withdrawal_reference_sequences (warehouse_id, year, last_number) VALUES (:warehouseId, :year, 1)
     ON CONFLICT (warehouse_id, year) DO UPDATE SET last_number = withdrawal_reference_sequences.last_number + 1
     RETURNING last_number AS "lastNumber"`,
    { replacements: { warehouseId, year }, type: QueryTypes.SELECT, transaction }
  );
  return row.lastNumber;
};

export const createMovement = async ({ lines, documents = [], ...header }, { transaction }) => {
  const created = await MovementHeader.create(header, { transaction });
  await MovementLine.bulkCreate(
    lines.map((line) => ({ ...line, movementHeaderId: created.id })),
    { transaction }
  );
  if (documents.length) {
    await MovementDocument.bulkCreate(
      documents.map((doc) => ({ ...doc, movementHeaderId: created.id })),
      { transaction }
    );
  }
  return created.id;
};

// --- Documentos de recepción ------------------------------------------------------------------

const DOCUMENT_INCLUDE = [
  { model: User, as: 'fileUploadedBy', attributes: ['id', 'fullName'] },
  { model: MovementHeader, as: 'header', attributes: ['id', 'documentNumber', 'movementType', 'createdByUserId'] },
];

/**
 * Documento de un movimiento (null si no existe o es de otro movimiento), con su cabecera y quién
 * adjuntó el archivo. lock: true bloquea la fila del documento (FOR UPDATE) para adjuntar el archivo.
 */
export const findDocument = async (movementId, documentId, { transaction, lock = false } = {}) =>
  plain(
    await MovementDocument.findOne({
      where: { id: documentId, movementHeaderId: movementId },
      include: DOCUMENT_INCLUDE,
      transaction,
      lock: lock ? { level: Transaction.LOCK.UPDATE, of: MovementDocument } : undefined,
    })
  );

/** Adjunta el archivo (columnas file_*). trg_movement_documents_rules impide hacerlo dos veces. */
export const attachDocumentFile = async (documentId, file, { transaction }) => {
  await MovementDocument.update(file, { where: { id: documentId }, transaction });
};

// --- Préstamos y devoluciones (HU-405) ---------------------------------------------------------

/**
 * Lo pendiente de devolver por (activo, producto), business_rules.md §2.2 regla 3:
 * Σ OUT PRESTAMO − Σ IN DEVOLUCION. Solo pares con saldo > 0.
 */
const PENDING_BY_PAIR_SQL = `
  SELECT l.asset_id, l.product_id,
         sum(CASE WHEN h.movement_type = 'OUT' THEN l.quantity ELSE 0 END) AS lent,
         sum(CASE WHEN h.movement_type = 'IN' THEN l.quantity ELSE 0 END) AS returned,
         sum(CASE WHEN h.movement_type = 'OUT' THEN l.quantity ELSE -l.quantity END) AS pending
  FROM movement_lines l JOIN movement_headers h ON h.id = l.movement_header_id
  WHERE l.asset_id IS NOT NULL
    AND ((h.movement_type = 'OUT' AND h.reason = 'PRESTAMO') OR (h.movement_type = 'IN' AND h.reason = 'DEVOLUCION'))
  GROUP BY l.asset_id, l.product_id
  HAVING sum(CASE WHEN h.movement_type = 'OUT' THEN l.quantity ELSE -l.quantity END) > 0`;

/**
 * Serializa las devoluciones de un mismo activo: dos devoluciones simultáneas no pueden ver el mismo
 * pendiente y devolverlo dos veces. Bloqueo por activo, en orden ascendente (sin deadlocks), que dura
 * hasta el fin de la transacción.
 */
export const lockLoansOfAssets = async (assetIds, { transaction }) => {
  for (const assetId of assetIds) {
    await sequelize.query("SELECT pg_advisory_xact_lock(hashtext('loans.asset'), :assetId)", { replacements: { assetId }, transaction });
  }
};

/** Pendiente de esos activos: Map('assetId|productId' → texto NUMERIC) y el código de cada activo. */
export const findPendingLoansOfAssets = async (assetIds, { transaction } = {}) => {
  if (!assetIds.length) return { pending: new Map(), assetCodes: new Map() };
  const [rows, assets] = await Promise.all([
    sequelize.query(`SELECT asset_id AS "assetId", product_id AS "productId", pending::text AS pending FROM (${PENDING_BY_PAIR_SQL}) p WHERE asset_id IN (:assetIds)`, {
      replacements: { assetIds },
      type: QueryTypes.SELECT,
      transaction,
    }),
    sequelize.query('SELECT id, code FROM assets WHERE id IN (:assetIds)', { replacements: { assetIds }, type: QueryTypes.SELECT, transaction }),
  ]);
  return {
    pending: new Map(rows.map((r) => [`${r.assetId}|${r.productId}`, r.pending])),
    assetCodes: new Map(assets.map((a) => [a.id, a.code])),
  };
};

/**
 * Préstamos pendientes, uno por (activo, producto), con el último préstamo de ese par: su documento,
 * fecha, almacén y quién lo recibió (la devolución vuelve por defecto a ese almacén).
 * Filtros: assetId, movementId (solo los pares de ese préstamo) y search (código o nombre del activo,
 * del producto o de quien lo recibió).
 */
export const listPendingLoans = async ({ page, limit, assetId, movementId, search }) => {
  const where = [];
  if (assetId) where.push('p.asset_id = :assetId');
  if (movementId) where.push('EXISTS (SELECT 1 FROM movement_lines ml WHERE ml.movement_header_id = :movementId AND ml.asset_id = p.asset_id AND ml.product_id = p.product_id)');
  if (search) where.push("(a.code ILIKE :pattern OR a.name ILIKE :pattern OR pr.code ILIKE :pattern OR pr.name ILIKE :pattern OR last.received_by ILIKE :pattern)");
  const from = `
    FROM (${PENDING_BY_PAIR_SQL}) p
    JOIN assets a ON a.id = p.asset_id
    JOIN products pr ON pr.id = p.product_id
    JOIN units u ON u.id = pr.unit_id
    JOIN LATERAL (
      SELECT h.id, h.document_number, h.movement_date, h.received_by, w.id AS warehouse_id, w.code AS warehouse_code, w.name AS warehouse_name
      FROM movement_lines l JOIN movement_headers h ON h.id = l.movement_header_id JOIN warehouses w ON w.id = h.warehouse_from_id
      WHERE l.asset_id = p.asset_id AND l.product_id = p.product_id AND h.movement_type = 'OUT' AND h.reason = 'PRESTAMO'
      ORDER BY h.movement_date DESC, h.id DESC
      LIMIT 1
    ) last ON true
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`;
  const replacements = { assetId, movementId, pattern: search ? `%${search.replace(/[\%_]/g, (ch) => `\${ch}`)}%` : null, limit, offset: (page - 1) * limit };
  const [rows, [{ total }]] = await Promise.all([
    sequelize.query(
      `SELECT a.id AS "assetId", a.code AS "assetCode", a.name AS "assetName",
              pr.id AS "productId", pr.code AS "productCode", pr.name AS "productName", u.code AS "unitCode",
              p.lent::text AS lent, p.returned::text AS returned, p.pending::text AS pending,
              last.id AS "loanId", last.document_number AS "loanDocumentNumber", last.movement_date AS "loanDate", last.received_by AS "receivedBy",
              last.warehouse_id AS "warehouseId", last.warehouse_code AS "warehouseCode", last.warehouse_name AS "warehouseName"
       ${from}
       ORDER BY last.movement_date ASC, a.code COLLATE natural_sort, pr.code
       LIMIT :limit OFFSET :offset`,
      { replacements, type: QueryTypes.SELECT }
    ),
    sequelize.query(`SELECT count(*)::int AS total ${from}`, { replacements, type: QueryTypes.SELECT }),
  ]);
  return { items: rows, total };
};

// --- Correcciones (HU-406) -----------------------------------------------------------------------

/**
 * Serializa las correcciones de un mismo movimiento: dos correcciones simultáneas no pueden ver el
 * mismo saldo por corregir. Dura hasta el fin de la transacción.
 */
export const lockCorrectionsOf = async (movementId, { transaction }) => {
  await sequelize.query("SELECT pg_advisory_xact_lock(hashtext('movements.correction'), :movementId)", { replacements: { movementId }, transaction });
};

/**
 * Correcciones registradas de un movimiento (referencia REV-{documento}): sus cabeceras y lo ya
 * corregido por (producto, activo), que es la clave única de las líneas del original.
 */
export const findCorrectionsOf = async (documentNumber, { transaction } = {}) => {
  const reference = `REV-${documentNumber}`;
  const [headers, lines] = await Promise.all([
    sequelize.query(
      `SELECT id, document_number AS "documentNumber", movement_date AS "movementDate" FROM movement_headers WHERE reference = :reference ORDER BY id`,
      { replacements: { reference }, type: QueryTypes.SELECT, transaction }
    ),
    sequelize.query(
      `SELECT l.product_id AS "productId", l.asset_id AS "assetId", sum(l.quantity)::text AS quantity
       FROM movement_lines l JOIN movement_headers h ON h.id = l.movement_header_id
       WHERE h.reference = :reference
       GROUP BY l.product_id, l.asset_id`,
      { replacements: { reference }, type: QueryTypes.SELECT, transaction }
    ),
  ]);
  return { headers, corrected: new Map(lines.map((l) => [`${l.productId}|${l.assetId ?? ''}`, l.quantity])) };
};

/** id y número del movimiento con ese número de documento, o null. */
export const findByDocumentNumber = async (documentNumber, { transaction } = {}) =>
  plain(await MovementHeader.findOne({ where: { documentNumber }, attributes: ['id', 'documentNumber'], transaction }));
