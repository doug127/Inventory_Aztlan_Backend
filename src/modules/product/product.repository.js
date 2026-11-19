// Consultas de productos (HU-204). No valida ni lanza errores de negocio: devuelve objetos planos o
// null y el service decide. minStock, maxStock y las existencias llegan como string (NUMERIC).
import { Op, QueryTypes, Transaction } from 'sequelize';
import { sequelize } from '#src/config/database.js';
import { Product, ProductCategory, Unit } from '#src/database/models/index.model.js';

const plain = (row) => (row ? row.get({ plain: true }) : null);

const INCLUDE = [
  { model: ProductCategory, as: 'category', attributes: ['id', 'code', 'name', 'isActive'] },
  { model: Unit, as: 'unit', attributes: ['id', 'code', 'name', 'isActive'] },
];

// Existencias y uso: lo que la interfaz necesita para saber qué se puede editar o desactivar.
const USAGE_ATTRIBUTES = [
  [sequelize.literal('(SELECT COALESCE(sum(s.quantity), 0) FROM stock s WHERE s.product_id = "Product".id)'), 'totalStock'],
  [sequelize.literal('(SELECT count(*)::int FROM stock s WHERE s.product_id = "Product".id AND s.quantity > 0)'), 'warehousesWithStock'],
  [sequelize.literal('EXISTS (SELECT 1 FROM movement_lines l WHERE l.product_id = "Product".id)'), 'hasMovements'],
];

const SORT_COLUMNS = { code: ['code'], name: ['name'], createdAt: ['createdAt'] };

const escapeLike = (text) => text.replace(/[\\%_]/g, (ch) => `\\${ch}`);

/** Lista paginada. categoryIds: la categoría filtrada y sus subcategorías (las resuelve el service). */
export const listProducts = async ({ page, limit, search, isActive, categoryIds, unitId, sort, order }) => {
  const and = [];
  if (isActive !== undefined) and.push({ isActive });
  if (categoryIds) and.push({ productCategoryId: categoryIds });
  if (unitId) and.push({ unitId });
  if (search) {
    const pattern = `%${escapeLike(search)}%`;
    and.push({ [Op.or]: [{ code: { [Op.iLike]: pattern } }, { name: { [Op.iLike]: pattern } }] });
  }
  const { rows, count } = await Product.findAndCountAll({
    where: and.length ? { [Op.and]: and } : {},
    attributes: { include: USAGE_ATTRIBUTES },
    include: INCLUDE,
    order: [[...SORT_COLUMNS[sort], order === 'desc' ? 'DESC' : 'ASC'], ['id', 'ASC']],
    limit,
    offset: (page - 1) * limit,
    distinct: true,
  });
  return { items: rows.map(plain), total: count };
};

/**
 * Con lock: 'update' (FOR UPDATE) para cambiar la unidad o desactivar sin carreras; con
 * lock: 'share' (FOR SHARE) un movimiento impide que el producto cambie mientras se registra.
 * Con lock no se calculan las existencias.
 */
export const findProductById = async (id, { transaction, lock } = {}) =>
  plain(
    await Product.findByPk(id, {
      attributes: lock ? undefined : { include: USAGE_ATTRIBUTES },
      include: lock ? [] : INCLUDE,
      transaction,
      lock: lock ? { level: lock === 'share' ? Transaction.LOCK.SHARE : Transaction.LOCK.UPDATE, of: Product } : undefined,
    })
  );

/** Qué campos únicos ya usa otro producto: el código y el nombre (sin distinguir mayúsculas). */
export const findTakenFields = async ({ code, name }, { excludeId, transaction } = {}) => {
  const conditions = [];
  if (code) conditions.push({ code });
  if (name) conditions.push(sequelize.where(sequelize.fn('lower', sequelize.col('name')), name.toLowerCase()));
  if (!conditions.length) return {};
  const rows = await Product.findAll({
    where: { [Op.or]: conditions, ...(excludeId && { id: { [Op.ne]: excludeId } }) },
    attributes: ['code', 'name'],
    transaction,
  });
  return {
    ...(code && rows.some((r) => r.code === code) && { code: true }),
    ...(name && rows.some((r) => r.name.toLowerCase() === name.toLowerCase()) && { name: true }),
  };
};

/** Mayor correlativo usado con un prefijo de categoría (LUBR-0002 → 2), o 0 si no hay ninguno. */
export const findLastSequence = async (prefix, { transaction } = {}) => {
  const [row] = await sequelize.query(
    `SELECT COALESCE(max(substring(code FROM 6)::int), 0) AS last
     FROM products WHERE code LIKE :pattern AND code ~ '^[A-Z]{4}-[0-9]{4}$'`,
    { replacements: { pattern: `${prefix}-%` }, type: QueryTypes.SELECT, transaction }
  );
  return Number(row.last);
};

/**
 * Serializa la asignación de códigos dentro de una categoría: dos altas simultáneas en LUBR
 * calcularían el mismo LUBR-0003. El candado dura hasta el fin de la transacción.
 */
export const lockCodeSequence = async (categoryId, { transaction }) => {
  await sequelize.query("SELECT pg_advisory_xact_lock(hashtext('products.code'), :categoryId)", {
    replacements: { categoryId },
    transaction,
  });
};

/** ¿El producto aparece en algún movimiento? (regla 3: entonces no cambia su unidad). */
export const hasMovements = async (id, { transaction } = {}) => {
  const [row] = await sequelize.query('SELECT EXISTS (SELECT 1 FROM movement_lines WHERE product_id = :id) AS "has"', {
    replacements: { id },
    type: QueryTypes.SELECT,
    transaction,
  });
  return row.has;
};

/** Almacenes con existencia > 0 del producto (regla 4), contados dentro de la transacción. */
export const countWarehousesWithStock = async (id, { transaction } = {}) => {
  const [row] = await sequelize.query('SELECT count(*)::int AS count FROM stock WHERE product_id = :id AND quantity > 0', {
    replacements: { id },
    type: QueryTypes.SELECT,
    transaction,
  });
  return row.count;
};

export const createProduct = async (data, { transaction } = {}) => plain(await Product.create(data, { transaction }));

export const updateProduct = async (id, changes, { transaction } = {}) => {
  await Product.update(changes, { where: { id }, transaction });
};
