// Consultas de categorías de productos (HU-203). No valida ni lanza errores de negocio: devuelve
// objetos planos o null y el service decide. Los recorridos del árbol usan CTE recursivos, así se
// resuelven en una sola consulta sin importar la profundidad.
import { Op, QueryTypes, Transaction } from 'sequelize';
import { sequelize } from '#src/config/database.js';
import { ProductCategory } from '#src/database/models/index.model.js';

const plain = (row) => (row ? row.get({ plain: true }) : null);

const PARENT_INCLUDE = { model: ProductCategory, as: 'parent', attributes: ['id', 'code', 'name', 'isActive'] };

// Uso de la categoría, para saber si se puede desactivar o cambiar su código.
const USAGE_ATTRIBUTES = [
  [sequelize.literal('(SELECT count(*)::int FROM product_categories c WHERE c.parent_id = "ProductCategory".id AND c.is_active)'), 'activeChildren'],
  [sequelize.literal('(SELECT count(*)::int FROM product_categories c WHERE c.parent_id = "ProductCategory".id)'), 'totalChildren'],
  [sequelize.literal('(SELECT count(*)::int FROM products p WHERE p.product_category_id = "ProductCategory".id AND p.is_active)'), 'activeProducts'],
  [sequelize.literal('(SELECT count(*)::int FROM products p WHERE p.product_category_id = "ProductCategory".id)'), 'totalProducts'],
];

// Icono de la raíz de su rama (solo las raíces lo guardan), para la lista y la ficha.
const ROOT_ICON_ATTRIBUTE = [
  sequelize.literal(`(WITH RECURSIVE up AS (
     SELECT parent_id, icon, 0 AS distance FROM product_categories WHERE id = "ProductCategory".id
     UNION ALL
     SELECT c.parent_id, c.icon, up.distance + 1 FROM product_categories c JOIN up ON c.id = up.parent_id WHERE up.distance < 100
   ) SELECT icon FROM up WHERE parent_id IS NULL LIMIT 1)`),
  'rootIcon',
];

const SORT_COLUMNS = { code: ['code'], name: ['name'], createdAt: ['createdAt'] };

const escapeLike = (text) => text.replace(/[\\%_]/g, (ch) => `\\${ch}`);

/** Lista paginada y plana. parentId: hijas directas de esa categoría; root: solo las raíces. */
export const listCategories = async ({ page, limit, search, isActive, parentId, root, sort, order }) => {
  const and = [];
  if (isActive !== undefined) and.push({ isActive });
  if (parentId) and.push({ parentId });
  if (root) and.push({ parentId: null });
  if (search) {
    const pattern = `%${escapeLike(search)}%`;
    and.push({ [Op.or]: [{ code: { [Op.iLike]: pattern } }, { name: { [Op.iLike]: pattern } }] });
  }
  const { rows, count } = await ProductCategory.findAndCountAll({
    where: and.length ? { [Op.and]: and } : {},
    attributes: { include: [...USAGE_ATTRIBUTES, ROOT_ICON_ATTRIBUTE] },
    include: [PARENT_INCLUDE],
    order: [[...SORT_COLUMNS[sort], order === 'desc' ? 'DESC' : 'ASC'], ['id', 'ASC']],
    limit,
    offset: (page - 1) * limit,
    distinct: true,
  });
  return { items: rows.map(plain), total: count };
};

/** Todas las categorías con su uso, para armar el árbol en memoria (el catálogo es pequeño). */
export const findAllCategories = async () =>
  (
    await ProductCategory.findAll({
      attributes: { include: USAGE_ATTRIBUTES },
      include: [PARENT_INCLUDE],
      order: [['name', 'ASC'], ['id', 'ASC']],
    })
  ).map(plain);

/**
 * Con lock: 'update' (FOR UPDATE) para desactivar sin carreras; con lock: 'share' (FOR SHARE) quien
 * crea una subcategoría o un producto impide que la categoría se desactive mientras tanto.
 * Con lock no se calcula el uso (las subconsultas no se pueden bloquear).
 */
export const findCategoryById = async (id, { transaction, lock } = {}) =>
  plain(
    await ProductCategory.findByPk(id, {
      attributes: lock ? undefined : { include: [...USAGE_ATTRIBUTES, ROOT_ICON_ATTRIBUTE] },
      include: lock ? [] : [PARENT_INCLUDE],
      transaction,
      lock: lock ? { level: lock === 'share' ? Transaction.LOCK.SHARE : Transaction.LOCK.UPDATE, of: ProductCategory } : undefined,
    })
  );

/** Hijas directas, para la ficha de una categoría. */
export const findChildren = async (parentId) =>
  (
    await ProductCategory.findAll({
      where: { parentId },
      attributes: ['id', 'code', 'name', 'isActive'],
      order: [['name', 'ASC']],
    })
  ).map(plain);

/** Ancestros de una categoría, de la raíz hacia el padre directo (la ruta "Insumos › Fertilizantes"). */
export const findAncestors = async (id, { transaction } = {}) =>
  sequelize.query(
    `WITH RECURSIVE up AS (
       SELECT parent_id, 1 AS distance FROM product_categories WHERE id = :id
       UNION ALL
       SELECT c.parent_id, up.distance + 1
       FROM product_categories c JOIN up ON c.id = up.parent_id
       WHERE up.distance < 100
     )
     SELECT c.id, c.code, c.name, c.is_active AS "isActive"
     FROM up JOIN product_categories c ON c.id = up.parent_id
     ORDER BY up.distance DESC`,
    { replacements: { id }, type: QueryTypes.SELECT, transaction }
  );

/**
 * Ids de la categoría y de todas sus descendientes. Sirve para validar ciclos al mover y para los
 * filtros que "incluyen subcategorías" (existencias, reportes).
 */
export const findSubtreeIds = async (id, { transaction } = {}) => {
  const rows = await sequelize.query(
    `WITH RECURSIVE down AS (
       SELECT id, 0 AS depth FROM product_categories WHERE id = :id
       UNION ALL
       SELECT c.id, down.depth + 1
       FROM product_categories c JOIN down ON c.parent_id = down.id
       WHERE down.depth < 100
     )
     SELECT id FROM down`,
    { replacements: { id }, type: QueryTypes.SELECT, transaction }
  );
  return rows.map((row) => row.id);
};

/**
 * Qué campos únicos ya usa otra categoría: el código en todo el catálogo y el nombre dentro del
 * mismo padre (uq_product_categories_parent_name), sin distinguir mayúsculas.
 */
export const findTakenFields = async ({ code, name, parentId }, { excludeId, transaction } = {}) => {
  const conditions = [];
  if (code) conditions.push({ code });
  if (name) {
    conditions.push({
      [Op.and]: [{ parentId: parentId ?? null }, sequelize.where(sequelize.fn('lower', sequelize.col('name')), name.toLowerCase())],
    });
  }
  if (!conditions.length) return {};
  const rows = await ProductCategory.findAll({
    where: { [Op.or]: conditions, ...(excludeId && { id: { [Op.ne]: excludeId } }) },
    attributes: ['code', 'name', 'parentId'],
    transaction,
  });
  return {
    ...(code && rows.some((r) => r.code === code) && { code: true }),
    ...(name &&
      rows.some((r) => r.name.toLowerCase() === name.toLowerCase() && r.parentId === (parentId ?? null)) && { name: true }),
  };
};

export const createCategory = async (data, { transaction } = {}) => plain(await ProductCategory.create(data, { transaction }));

export const updateCategory = async (id, changes, { transaction } = {}) => {
  await ProductCategory.update(changes, { where: { id }, transaction });
};

/** Hijas y productos activos, contados dentro de la transacción (para desactivar sin carreras). */
export const countActiveDependencies = async (id, { transaction } = {}) => {
  const [usage] = await sequelize.query(
    `SELECT (SELECT count(*)::int FROM product_categories WHERE parent_id = :id AND is_active) AS "activeChildren",
            (SELECT count(*)::int FROM products WHERE product_category_id = :id AND is_active) AS "activeProducts"`,
    { replacements: { id }, type: QueryTypes.SELECT, transaction }
  );
  return usage;
};

/**
 * Serializa los cambios de padre: dos movimientos simultáneos (A bajo B y B bajo A) pasarían cada
 * uno su validación de ciclo por separado. El candado dura hasta el fin de la transacción.
 */
export const lockTreeForMove = async ({ transaction }) => {
  await sequelize.query("SELECT pg_advisory_xact_lock(hashtext('product_categories.tree'))", { transaction });
};
