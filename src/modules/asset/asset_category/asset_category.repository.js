// Consultas de categorías de activos (HU-301). No valida ni lanza errores de negocio: devuelve
// objetos planos o null y el service decide. Los recorridos del árbol usan CTE recursivos.
import { Op, QueryTypes, Transaction } from 'sequelize';
import { sequelize } from '#src/config/database.js';
import { AssetCategory } from '#src/database/models/index.model.js';

const plain = (row) => (row ? row.get({ plain: true }) : null);

const PARENT_INCLUDE = { model: AssetCategory, as: 'parent', attributes: ['id', 'code', 'name', 'isActive'] };

// Uso de la categoría: hijas y activos. Con activos no admite hijas; con hijas no admite activos.
const USAGE_ATTRIBUTES = [
  [sequelize.literal('(SELECT count(*)::int FROM asset_categories c WHERE c.parent_id = "AssetCategory".id AND c.is_active)'), 'activeChildren'],
  [sequelize.literal('(SELECT count(*)::int FROM asset_categories c WHERE c.parent_id = "AssetCategory".id)'), 'totalChildren'],
  [sequelize.literal('(SELECT count(*)::int FROM assets a WHERE a.asset_category_id = "AssetCategory".id AND a.is_active)'), 'activeAssets'],
  [sequelize.literal('(SELECT count(*)::int FROM assets a WHERE a.asset_category_id = "AssetCategory".id)'), 'totalAssets'],
];

// Icono de la raíz de su rama (solo las raíces lo guardan), para la lista y la ficha.
const ROOT_ICON_ATTRIBUTE = [
  sequelize.literal(`(WITH RECURSIVE up AS (
     SELECT parent_id, icon, 0 AS distance FROM asset_categories WHERE id = "AssetCategory".id
     UNION ALL
     SELECT c.parent_id, c.icon, up.distance + 1 FROM asset_categories c JOIN up ON c.id = up.parent_id WHERE up.distance < 100
   ) SELECT icon FROM up WHERE parent_id IS NULL LIMIT 1)`),
  'rootIcon',
];

const SORT_COLUMNS = { code: ['code'], name: ['name'], createdAt: ['createdAt'] };

const escapeLike = (text) => text.replace(/[\\%_]/g, (ch) => `\\${ch}`);

/** Lista paginada y plana. parentId: hijas directas; root: solo raíces; leaf: solo hojas (para elegir la de un activo). */
export const listCategories = async ({ page, limit, search, isActive, parentId, root, leaf, sort, order }) => {
  const and = [];
  if (isActive !== undefined) and.push({ isActive });
  if (parentId) and.push({ parentId });
  if (root) and.push({ parentId: null });
  if (leaf !== undefined) {
    const hasChildren = 'EXISTS (SELECT 1 FROM asset_categories c WHERE c.parent_id = "AssetCategory".id)';
    and.push(sequelize.literal(leaf ? `NOT ${hasChildren}` : hasChildren));
  }
  if (search) {
    const pattern = `%${escapeLike(search)}%`;
    and.push({ [Op.or]: [{ code: { [Op.iLike]: pattern } }, { name: { [Op.iLike]: pattern } }] });
  }
  const { rows, count } = await AssetCategory.findAndCountAll({
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
    await AssetCategory.findAll({
      attributes: { include: USAGE_ATTRIBUTES },
      include: [PARENT_INCLUDE],
      order: [['name', 'ASC'], ['id', 'ASC']],
    })
  ).map(plain);

/**
 * lock: 'update' (FOR UPDATE) al desactivar y al colgarle una hija; lock: 'share' (FOR SHARE) al
 * registrar un activo en ella. Así una hija y un activo nunca llegan a la vez a la misma categoría.
 * Con lock no se calcula el uso (las subconsultas no se pueden bloquear).
 */
export const findCategoryById = async (id, { transaction, lock } = {}) =>
  plain(
    await AssetCategory.findByPk(id, {
      attributes: lock ? undefined : { include: [...USAGE_ATTRIBUTES, ROOT_ICON_ATTRIBUTE] },
      include: lock ? [] : [PARENT_INCLUDE],
      transaction,
      lock: lock ? { level: lock === 'share' ? Transaction.LOCK.SHARE : Transaction.LOCK.UPDATE, of: AssetCategory } : undefined,
    })
  );

/** Hijas directas, para la ficha de una categoría. */
export const findChildren = async (parentId) =>
  (
    await AssetCategory.findAll({
      where: { parentId },
      attributes: ['id', 'code', 'name', 'isActive'],
      order: [['name', 'ASC']],
    })
  ).map(plain);

/** Ancestros, de la raíz hacia el padre directo (la ruta "Vehículos › Maquinaria agrícola"). */
export const findAncestors = async (id, { transaction } = {}) =>
  sequelize.query(
    `WITH RECURSIVE up AS (
       SELECT parent_id, 1 AS distance FROM asset_categories WHERE id = :id
       UNION ALL
       SELECT c.parent_id, up.distance + 1
       FROM asset_categories c JOIN up ON c.id = up.parent_id
       WHERE up.distance < 100
     )
     SELECT c.id, c.code, c.name, c.is_active AS "isActive"
     FROM up JOIN asset_categories c ON c.id = up.parent_id
     ORDER BY up.distance DESC`,
    { replacements: { id }, type: QueryTypes.SELECT, transaction }
  );

/** Ids de la categoría y de todas sus descendientes (ciclos al mover; conteos y reportes por rama). */
export const findSubtreeIds = async (id, { transaction } = {}) => {
  const rows = await sequelize.query(
    `WITH RECURSIVE down AS (
       SELECT id, 0 AS depth FROM asset_categories WHERE id = :id
       UNION ALL
       SELECT c.id, down.depth + 1
       FROM asset_categories c JOIN down ON c.parent_id = down.id
       WHERE down.depth < 100
     )
     SELECT id FROM down`,
    { replacements: { id }, type: QueryTypes.SELECT, transaction }
  );
  return rows.map((row) => row.id);
};

/** Código único en todo el catálogo y nombre único dentro del mismo padre, sin distinguir mayúsculas. */
export const findTakenFields = async ({ code, name, parentId }, { excludeId, transaction } = {}) => {
  const conditions = [];
  if (code) conditions.push({ code });
  if (name) {
    conditions.push({
      [Op.and]: [{ parentId: parentId ?? null }, sequelize.where(sequelize.fn('lower', sequelize.col('name')), name.toLowerCase())],
    });
  }
  if (!conditions.length) return {};
  const rows = await AssetCategory.findAll({
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

export const createCategory = async (data, { transaction } = {}) => plain(await AssetCategory.create(data, { transaction }));

export const updateCategory = async (id, changes, { transaction } = {}) => {
  await AssetCategory.update(changes, { where: { id }, transaction });
};

/** Hijas y activos de la categoría, contados dentro de la transacción (con la fila ya bloqueada). */
export const countDependencies = async (id, { transaction } = {}) => {
  const [usage] = await sequelize.query(
    `SELECT (SELECT count(*)::int FROM asset_categories WHERE parent_id = :id AND is_active) AS "activeChildren",
            (SELECT count(*)::int FROM asset_categories WHERE parent_id = :id) AS "totalChildren",
            (SELECT count(*)::int FROM assets WHERE asset_category_id = :id AND is_active) AS "activeAssets",
            (SELECT count(*)::int FROM assets WHERE asset_category_id = :id) AS "totalAssets"`,
    { replacements: { id }, type: QueryTypes.SELECT, transaction }
  );
  return usage;
};

/** Serializa los cambios de padre (dos movimientos cruzados pasarían cada uno su validación de ciclo). */
export const lockTreeForMove = async ({ transaction }) => {
  await sequelize.query("SELECT pg_advisory_xact_lock(hashtext('asset_categories.tree'))", { transaction });
};
