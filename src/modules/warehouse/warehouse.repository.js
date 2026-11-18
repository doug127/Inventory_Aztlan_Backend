// Consultas de almacenes (HU-201). No valida ni lanza errores de negocio: devuelve objetos planos
// o null y el service decide.
import { Op, QueryTypes, Transaction } from 'sequelize';
import { sequelize } from '#src/config/database.js';
import { Warehouse } from '#src/database/models/index.model.js';

const plain = (row) => (row ? row.get({ plain: true }) : null);

// Existencias del almacén: cuántos productos tienen stock > 0. No se suman cantidades porque cada
// producto tiene su unidad (litros, kilos, piezas). Subconsulta correlacionada con "Warehouse".id.
const PRODUCTS_WITH_STOCK = sequelize.literal(
  '(SELECT count(*)::int FROM stock s WHERE s.warehouse_id = "Warehouse".id AND s.quantity > 0)'
);
const WITH_STOCK_SUMMARY = { include: [[PRODUCTS_WITH_STOCK, 'productsWithStock']] };

const SORT_COLUMNS = { code: 'code', name: 'name', createdAt: 'createdAt' };

export const listWarehouses = async ({ page, limit, search, isActive, sort, order }) => {
  const where = {};
  if (isActive !== undefined) where.isActive = isActive;
  if (search) {
    const pattern = `%${search.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
    where[Op.or] = [{ code: { [Op.iLike]: pattern } }, { name: { [Op.iLike]: pattern } }];
  }
  const { rows, count } = await Warehouse.findAndCountAll({
    where,
    attributes: WITH_STOCK_SUMMARY,
    order: [[SORT_COLUMNS[sort], order === 'desc' ? 'DESC' : 'ASC'], ['id', 'ASC']],
    limit,
    offset: (page - 1) * limit,
  });
  return { items: rows.map(plain), total: count };
};

/**
 * Con lock: 'update' bloquea la fila (FOR UPDATE) para desactivar sin carreras; con lock: 'share'
 * (FOR SHARE) un movimiento impide que el almacén se desactive mientras registra.
 */
export const findWarehouseById = async (id, { transaction, lock } = {}) =>
  plain(
    await Warehouse.findByPk(id, {
      attributes: lock ? undefined : WITH_STOCK_SUMMARY,
      transaction,
      lock: lock === 'update' ? Transaction.LOCK.UPDATE : lock === 'share' ? Transaction.LOCK.SHARE : undefined,
    })
  );

/** Qué campos únicos ya usa otro almacén. El nombre se compara sin distinguir mayúsculas. */
export const findTakenFields = async ({ code, name }, { excludeId } = {}) => {
  const conditions = [];
  if (code) conditions.push({ code });
  if (name) conditions.push(sequelize.where(sequelize.fn('lower', sequelize.col('name')), name.toLowerCase()));
  if (!conditions.length) return {};
  const rows = await Warehouse.findAll({
    where: { [Op.or]: conditions, ...(excludeId && { id: { [Op.ne]: excludeId } }) },
    attributes: ['code', 'name'],
  });
  return {
    ...(code && rows.some((r) => r.code === code) && { code: true }),
    ...(name && rows.some((r) => r.name.toLowerCase() === name.toLowerCase()) && { name: true }),
  };
};

export const createWarehouse = async (data, { transaction } = {}) => plain(await Warehouse.create(data, { transaction }));

export const updateWarehouse = async (id, changes, { transaction } = {}) => {
  await Warehouse.update(changes, { where: { id }, transaction });
};

/** Existencias reales del almacén (para la regla de desactivación). */
export const countProductsWithStock = async (warehouseId, { transaction } = {}) => {
  const [{ count }] = await sequelize.query(
    'SELECT count(*)::int AS count FROM stock WHERE warehouse_id = :warehouseId AND quantity > 0',
    { replacements: { warehouseId }, type: QueryTypes.SELECT, transaction }
  );
  return count;
};

/** ¿El almacén aparece en algún movimiento, como origen o destino? */
export const hasMovements = async (warehouseId, { transaction } = {}) => {
  const [row] = await sequelize.query(
    `SELECT EXISTS (
       SELECT 1 FROM movement_headers WHERE warehouse_from_id = :warehouseId OR warehouse_to_id = :warehouseId
     ) AS used`,
    { replacements: { warehouseId }, type: QueryTypes.SELECT, transaction }
  );
  return row.used;
};
