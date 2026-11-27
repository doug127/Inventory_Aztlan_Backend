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
