// Consultas de activos (HU-302). No valida ni lanza errores de negocio: devuelve objetos planos o
// null y el service decide.
import { Op, QueryTypes, Transaction } from 'sequelize';
import { sequelize } from '#src/config/database.js';
import { Asset, AssetCategory } from '#src/database/models/index.model.js';
import { CORRECTION_REFERENCE_PREFIX } from '#src/shared/constants/movements.js';

const plain = (row) => (row ? row.get({ plain: true }) : null);

const INCLUDE = [{ model: AssetCategory, as: 'category', attributes: ['id', 'code', 'name', 'isActive'] }];

// Préstamos pendientes por producto (business_rules.md §2.2): Σ OUT PRESTAMO − Σ IN DEVOLUCION.
const PENDING_LOANS_SQL = (assetRef) => `
  SELECT l.product_id,
         sum(CASE WHEN h.movement_type = 'OUT' THEN l.quantity ELSE -l.quantity END) AS pending
  FROM movement_lines l JOIN movement_headers h ON h.id = l.movement_header_id
  WHERE l.asset_id = ${assetRef}
    AND ((h.movement_type = 'OUT' AND h.reason = 'PRESTAMO') OR (h.movement_type = 'IN' AND h.reason = 'DEVOLUCION'))
  GROUP BY l.product_id
  HAVING sum(CASE WHEN h.movement_type = 'OUT' THEN l.quantity ELSE -l.quantity END) > 0`;

// Ruta de la categoría desde la raíz e icono de la raíz (solo las raíces lo guardan).
const CATEGORY_UP_CTE = `WITH RECURSIVE up AS (
    SELECT id, parent_id, code, name, icon, 0 AS distance FROM asset_categories WHERE id = "Asset".asset_category_id
    UNION ALL
    SELECT c.id, c.parent_id, c.code, c.name, c.icon, up.distance + 1 FROM asset_categories c JOIN up ON c.id = up.parent_id WHERE up.distance < 100
  )`;

const DETAIL_ATTRIBUTES = [
  [sequelize.literal(`(${CATEGORY_UP_CTE} SELECT json_agg(json_build_object('id', id, 'code', code, 'name', name) ORDER BY distance DESC) FROM up)`), 'categoryPath'],
  [sequelize.literal(`(${CATEGORY_UP_CTE} SELECT icon FROM up WHERE parent_id IS NULL LIMIT 1)`), 'rootIcon'],
  [sequelize.literal('EXISTS (SELECT 1 FROM movement_lines l WHERE l.asset_id = "Asset".id)'), 'hasMovements'],
  [sequelize.literal(`(SELECT count(*)::int FROM (${PENDING_LOANS_SQL('"Asset".id')}) p)`), 'pendingLoans'],
];

// Orden natural (migración 20261122000001): TB-99 antes que TB-100 y "Tablón 2" antes que "Tablón 10".
const natural = (column) => sequelize.literal(`"Asset"."${column}" COLLATE natural_sort`);
const SORT_COLUMNS = { code: [natural('code')], name: [natural('name')], createdAt: ['createdAt'] };

const escapeLike = (text) => text.replace(/[\\%_]/g, (ch) => `\\${ch}`);

/** Lista paginada. categoryIds: la categoría filtrada y sus subcategorías (las resuelve el service). */
export const listAssets = async ({ page, limit, search, isActive, categoryIds, sort, order }) => {
  const and = [];
  if (isActive !== undefined) and.push({ isActive });
  if (categoryIds) and.push({ assetCategoryId: categoryIds });
  if (search) {
    const pattern = `%${escapeLike(search)}%`;
    and.push({ [Op.or]: [{ code: { [Op.iLike]: pattern } }, { name: { [Op.iLike]: pattern } }] });
  }
  const { rows, count } = await Asset.findAndCountAll({
    where: and.length ? { [Op.and]: and } : {},
    attributes: { include: DETAIL_ATTRIBUTES },
    include: INCLUDE,
    order: [[...SORT_COLUMNS[sort], order === 'desc' ? 'DESC' : 'ASC'], ['id', 'ASC']],
    limit,
    offset: (page - 1) * limit,
    distinct: true,
  });
  return { items: rows.map(plain), total: count };
};

/**
 * Activos agrupados por su categoría hoja (un lote con sus tablones): cuántos tiene cada una y el
 * primer y el último código en orden natural. Los grupos se ordenan por la ruta de la categoría
 * ("Campo › Lote 2" antes que "Campo › Lote 10"). Mismos filtros que listAssets; las categorías
 * sin activos que cumplan el filtro no aparecen.
 */
export const listAssetGroups = async ({ page, limit, search, isActive, categoryIds }) => {
  const where = [];
  const replacements = { limit, offset: (page - 1) * limit };
  if (isActive !== undefined) {
    where.push('a.is_active = :isActive');
    replacements.isActive = isActive;
  }
  if (categoryIds) {
    where.push('a.asset_category_id IN (:categoryIds)');
    replacements.categoryIds = categoryIds;
  }
  if (search) {
    where.push("(a.code ILIKE :pattern OR a.name ILIKE :pattern)");
    replacements.pattern = `%${escapeLike(search)}%`;
  }
  const rows = await sequelize.query(
    `WITH RECURSIVE g AS (
       SELECT a.asset_category_id AS category_id,
              count(*)::int AS assets,
              count(*) FILTER (WHERE a.is_active)::int AS active,
              min(a.code COLLATE natural_sort) AS first_code,
              max(a.code COLLATE natural_sort) AS last_code
       FROM assets a
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       GROUP BY a.asset_category_id
     ), up AS (
       SELECT g.category_id AS leaf_id, c.id, c.parent_id, c.code, c.name, c.icon, 0 AS distance
       FROM g JOIN asset_categories c ON c.id = g.category_id
       UNION ALL
       SELECT up.leaf_id, c.id, c.parent_id, c.code, c.name, c.icon, up.distance + 1
       FROM up JOIN asset_categories c ON c.id = up.parent_id
       WHERE up.distance < 100
     ), paths AS (
       SELECT leaf_id,
              json_agg(json_build_object('id', id, 'code', code, 'name', name) ORDER BY distance DESC) AS path,
              string_agg(name, ' › ' ORDER BY distance DESC) AS path_label,
              max(icon) FILTER (WHERE parent_id IS NULL) AS root_icon
       FROM up GROUP BY leaf_id
     )
     SELECT c.id, c.code, c.name, c.is_active AS "isActive", p.path, p.root_icon AS "rootIcon",
            g.assets, g.active, g.first_code AS "firstCode", g.last_code AS "lastCode",
            count(*) OVER ()::int AS "totalGroups"
     FROM g
     JOIN asset_categories c ON c.id = g.category_id
     JOIN paths p ON p.leaf_id = g.category_id
     ORDER BY p.path_label COLLATE natural_sort, c.id
     LIMIT :limit OFFSET :offset`,
    { replacements, type: QueryTypes.SELECT }
  );
  return { items: rows, total: rows[0]?.totalGroups ?? 0 };
};

/**
 * lock: 'update' (FOR UPDATE) al editar o desactivar; lock: 'share' (FOR SHARE) un movimiento
 * impide que el activo se desactive mientras se registra. Con lock no se calculan los detalles.
 */
export const findAssetById = async (id, { transaction, lock } = {}) =>
  plain(
    await Asset.findByPk(id, {
      attributes: lock ? undefined : { include: DETAIL_ATTRIBUTES },
      include: lock ? [] : INCLUDE,
      transaction,
      lock: lock ? { level: lock === 'share' ? Transaction.LOCK.SHARE : Transaction.LOCK.UPDATE, of: Asset } : undefined,
    })
  );

/** Código único en todo el catálogo y nombre único dentro de la categoría (sin distinguir mayúsculas). */
export const findTakenFields = async ({ code, name, categoryId }, { excludeId, transaction } = {}) => {
  const conditions = [];
  if (code) conditions.push({ code });
  if (name) {
    conditions.push({
      [Op.and]: [{ assetCategoryId: categoryId }, sequelize.where(sequelize.fn('lower', sequelize.col('name')), name.toLowerCase())],
    });
  }
  if (!conditions.length) return {};
  const rows = await Asset.findAll({
    where: { [Op.or]: conditions, ...(excludeId && { id: { [Op.ne]: excludeId } }) },
    attributes: ['code', 'name', 'assetCategoryId'],
    transaction,
  });
  return {
    ...(code && rows.some((r) => r.code === code) && { code: true }),
    ...(name && rows.some((r) => r.name.toLowerCase() === name.toLowerCase() && r.assetCategoryId === categoryId) && { name: true }),
  };
};

/** Prefijo más usado por los activos de la categoría (TRACTOR → "T"), o null si no tiene activos. */
export const findCategoryPrefix = async (categoryId, { transaction } = {}) => {
  const [row] = await sequelize.query(
    `SELECT split_part(code, '-', 1) AS prefix FROM assets WHERE asset_category_id = :categoryId
     GROUP BY 1 ORDER BY count(*) DESC, 1 LIMIT 1`,
    { replacements: { categoryId }, type: QueryTypes.SELECT, transaction }
  );
  return row?.prefix ?? null;
};

/**
 * Mayor identificador numérico usado con un prefijo en toda la finca (TB-101 → 101) y su ancho
 * (T-01 → 2). Sin identificadores numéricos (PE-TAL), last es null.
 */
export const findLastNumber = async (prefix, { transaction } = {}) => {
  const [row] = await sequelize.query(
    `SELECT max(split_part(code, '-', 2)::int) AS last, max(length(split_part(code, '-', 2)))::int AS width
     FROM assets WHERE code ~ ('^' || :prefix || '-[0-9]+$')`,
    { replacements: { prefix }, type: QueryTypes.SELECT, transaction }
  );
  return { last: row.last === null ? null : Number(row.last), width: row.width ?? 2 };
};

/** Serializa la asignación de códigos de un prefijo: dos altas simultáneas calcularían el mismo T-03. */
export const lockCodeSequence = async (prefix, { transaction }) => {
  await sequelize.query("SELECT pg_advisory_xact_lock(hashtext('assets.code'), hashtext(:prefix))", { replacements: { prefix }, transaction });
};

/** ¿El activo aparece en algún movimiento? (entonces su código ya está en órdenes impresas). */
export const hasMovements = async (id, { transaction } = {}) => {
  const [row] = await sequelize.query('SELECT EXISTS (SELECT 1 FROM movement_lines WHERE asset_id = :id) AS "has"', {
    replacements: { id },
    type: QueryTypes.SELECT,
    transaction,
  });
  return row.has;
};

/** Productos prestados al activo y aún no devueltos, con la cantidad pendiente (texto NUMERIC). */
export const findPendingLoans = async (id, { transaction } = {}) =>
  sequelize.query(
    `SELECT p.code, p.name, u.code AS "unitCode", loans.pending::text AS pending
     FROM (${PENDING_LOANS_SQL(':id')}) loans
     JOIN products p ON p.id = loans.product_id JOIN units u ON u.id = p.unit_id
     ORDER BY p.code`,
    { replacements: { id }, type: QueryTypes.SELECT, transaction }
  );

export const createAsset = async (data, { transaction } = {}) => plain(await Asset.create(data, { transaction }));

export const updateAsset = async (id, changes, { transaction } = {}) => {
  await Asset.update(changes, { where: { id }, transaction });
};

/** Compatibilidad con el módulo de movimientos heredado (se reescribe en HU-401). */
export const findAssetsByIdsRepository = async (ids, transaction) => (await Asset.findAll({ where: { id: ids }, transaction })).map(plain);

// --- Ficha del activo: consumos e historial (HU-304) ------------------------------

// Clase de cada línea para el activo (shared/constants/movements.js, ASSET_LINE_KINDS). El consumo
// neto (business_rules.md §5) es CONSUMO − CORRECCION.
const LINE_KIND_SQL = `CASE
    WHEN h.movement_type = 'OUT' AND h.reason = 'CONSUMO' THEN 'CONSUMO'
    WHEN h.movement_type = 'IN' AND h.reason = 'OTRO' AND h.reference LIKE '${CORRECTION_REFERENCE_PREFIX}%' THEN 'CORRECCION'
    WHEN h.movement_type = 'OUT' AND h.reason = 'PRESTAMO' THEN 'PRESTAMO'
    WHEN h.movement_type = 'IN' AND h.reason = 'DEVOLUCION' THEN 'DEVOLUCION'
    ELSE 'OTRO'
  END`;

/** Líneas del activo con su clase, dentro del período [from, to). */
const assetLinesSql = ({ from, to }) => `
  SELECT l.id, l.product_id, l.quantity, l.note AS line_note, h.id AS movement_id, h.document_number, h.movement_type,
         h.reason, h.reference, h.movement_date, h.warehouse_from_id, h.warehouse_to_id, h.received_by,
         h.created_by_user_id, ${LINE_KIND_SQL} AS kind
  FROM movement_lines l JOIN movement_headers h ON h.id = l.movement_header_id
  WHERE l.asset_id = :id
    ${from ? 'AND h.movement_date >= :from' : ''}
    ${to ? 'AND h.movement_date < :to' : ''}`;

/**
 * Consumo del activo por producto en el período: Σ consumido y Σ corregido (texto NUMERIC, el service
 * resta con decimal.js), cuántas líneas lo forman y la fecha del último consumo.
 */
export const findAssetConsumption = async (id, { from, to } = {}) =>
  sequelize.query(
    `SELECT p.id, p.code, p.name, u.code AS "unitCode",
            COALESCE(sum(x.quantity) FILTER (WHERE x.kind = 'CONSUMO'), 0)::text AS consumed,
            COALESCE(sum(x.quantity) FILTER (WHERE x.kind = 'CORRECCION'), 0)::text AS corrected,
            count(*)::int AS lines,
            max(x.movement_date) FILTER (WHERE x.kind = 'CONSUMO') AS "lastConsumedAt"
     FROM (${assetLinesSql({ from, to })}) x
     JOIN products p ON p.id = x.product_id JOIN units u ON u.id = p.unit_id
     WHERE x.kind IN ('CONSUMO', 'CORRECCION')
     GROUP BY p.id, p.code, p.name, u.code
     ORDER BY p.code`,
    { replacements: { id, from, to }, type: QueryTypes.SELECT }
  );

/** Primer y último movimiento del activo y cuántas líneas tiene en total (sin período). */
export const findAssetActivity = async (id) => {
  const [row] = await sequelize.query(
    `SELECT count(*)::int AS lines, min(h.movement_date) AS "firstMovementAt", max(h.movement_date) AS "lastMovementAt"
     FROM movement_lines l JOIN movement_headers h ON h.id = l.movement_header_id
     WHERE l.asset_id = :id`,
    { replacements: { id }, type: QueryTypes.SELECT }
  );
  return row;
};

/** Historial de líneas del activo, del más reciente al más antiguo. kinds y productId son opcionales. */
export const listAssetHistory = async (id, { page, limit, from, to, productId, kinds }) => {
  const filters = [];
  if (productId) filters.push('x.product_id = :productId');
  if (kinds?.length) filters.push('x.kind IN (:kinds)');
  const rows = await sequelize.query(
    `SELECT x.id, x.quantity::text AS quantity, x.line_note AS "lineNote", x.kind,
            x.movement_id AS "movementId", x.document_number AS "documentNumber", x.movement_type AS "movementType",
            x.reason, x.reference, x.movement_date AS "movementDate", x.received_by AS "receivedBy",
            json_build_object('id', p.id, 'code', p.code, 'name', p.name, 'unitCode', u.code) AS product,
            CASE WHEN w.id IS NULL THEN NULL ELSE json_build_object('id', w.id, 'code', w.code, 'name', w.name) END AS warehouse,
            json_build_object('id', cu.id, 'fullName', cu.full_name) AS "createdBy",
            count(*) OVER ()::int AS "totalItems"
     FROM (${assetLinesSql({ from, to })}) x
     JOIN products p ON p.id = x.product_id
     JOIN units u ON u.id = p.unit_id
     JOIN users cu ON cu.id = x.created_by_user_id
     LEFT JOIN warehouses w ON w.id = COALESCE(x.warehouse_from_id, x.warehouse_to_id)
     ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
     ORDER BY x.movement_date DESC, x.movement_id DESC, x.id DESC
     LIMIT :limit OFFSET :offset`,
    { replacements: { id, from, to, productId, kinds, limit, offset: (page - 1) * limit }, type: QueryTypes.SELECT }
  );
  return { items: rows, total: rows[0]?.totalItems ?? 0 };
};
