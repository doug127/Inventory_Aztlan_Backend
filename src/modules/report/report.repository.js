// Consultas de los reportes (HU-501 y HU-502). SQL crudo: agregaciones sobre las líneas de movimientos.
import { QueryTypes } from 'sequelize';
import { sequelize } from '#src/config/database.js';
import { SERVER_TIME_ZONE, dayBounds } from '#src/shared/schemas/dates.js';
import { CORRECTION_REFERENCE_PREFIX } from '#src/shared/constants/movements.js';

/**
 * Líneas que forman el consumo neto (business_rules.md §5): las OUT CONSUMO (kind CONSUMO) y las IN
 * OTRO que corrigen una OUT CONSUMO (referencia REV-{documento del consumo}, kind CORRECCION). Las IN
 * OTRO que corrigen un desecho, una venta u otra salida no restan consumo. Cada línea cuenta en la fecha
 * de su propio movimiento: una corrección cae en el período en que se registró.
 */
const consumptionLinesSql = (range) => `
  SELECT l.asset_id, l.product_id, l.quantity, h.movement_date,
         CASE WHEN h.movement_type = 'OUT' THEN 'CONSUMO' ELSE 'CORRECCION' END AS kind
  FROM movement_lines l
  JOIN movement_headers h ON h.id = l.movement_header_id
  LEFT JOIN movement_headers o
    ON h.movement_type = 'IN' AND h.reason = 'OTRO' AND h.reference = '${CORRECTION_REFERENCE_PREFIX}' || o.document_number
  WHERE l.asset_id IS NOT NULL
    AND ((h.movement_type = 'OUT' AND h.reason = 'CONSUMO') OR (o.movement_type = 'OUT' AND o.reason = 'CONSUMO'))
    ${range.map((condition) => `AND ${condition}`).join(' ')}`;

/**
 * Para agrupar por categoría: a qué categoría "cubeta" sube cada categoría de activos. Con filtro, las
 * hijas directas del filtro (o el filtro mismo si es hoja); sin filtro, las raíces. Así, con VEHICULOS
 * se compara Maquinaria agrícola contra Línea amarilla y Transporte.
 */
const bucketCte = (assetCategoryId) => `
  chain AS (
    SELECT id AS leaf_id, id AS ancestor_id, parent_id FROM asset_categories
    UNION ALL
    SELECT c.leaf_id, p.id, p.parent_id FROM chain c JOIN asset_categories p ON p.id = c.parent_id
  ),
  bucket AS (
    SELECT DISTINCT ON (leaf_id) leaf_id, ancestor_id FROM chain
    WHERE ${assetCategoryId ? 'ancestor_id = :assetCategoryId OR parent_id = :assetCategoryId' : 'parent_id IS NULL'}
    ORDER BY leaf_id, ${assetCategoryId ? '(ancestor_id = :assetCategoryId)' : 'ancestor_id'}
  )`;

const SUMS = `
  COALESCE(sum(x.quantity) FILTER (WHERE x.kind = 'CONSUMO'), 0)::text AS consumed,
  COALESCE(sum(x.quantity) FILTER (WHERE x.kind = 'CORRECCION'), 0)::text AS corrected,
  (COALESCE(sum(x.quantity) FILTER (WHERE x.kind = 'CONSUMO'), 0) - COALESCE(sum(x.quantity) FILTER (WHERE x.kind = 'CORRECCION'), 0))::text AS net,
  count(*)::int AS lines,
  count(DISTINCT x.asset_id)::int AS assets,
  max(x.movement_date) FILTER (WHERE x.kind = 'CONSUMO') AS "lastConsumedAt"`;

const PRODUCT_JSON = `json_build_object('id', p.id, 'code', p.code, 'name', p.name, 'unitCode', u.code)`;

/**
 * Consumo agrupado por activo o por categoría y producto, con total de filas para paginar, y summary:
 * los totales por producto de todo el alcance (no dependen de la página) y cuántos grupos hay.
 * Filtros: productId, productCategoryIds, assetId, assetCategoryIds (ya con subcategorías), from y to
 * ('AAAA-MM-DD' inclusive). Las cantidades vuelven como texto NUMERIC.
 */
export const findConsumption = async ({ groupBy, from, to, productId, productCategoryIds, assetId, assetCategoryId, assetCategoryIds, page, limit }) => {
  const range = [from && 'h.movement_date >= :fromStart', to && 'h.movement_date < :toEnd'].filter(Boolean);
  const where = [
    productId && 'p.id = :productId',
    productCategoryIds && 'p.product_category_id IN (:productCategoryIds)',
    assetId && 'a.id = :assetId',
    assetCategoryIds && 'a.asset_category_id IN (:assetCategoryIds)',
  ].filter(Boolean);
  const byCategory = groupBy === 'assetCategory';
  const scope = `
    WITH RECURSIVE x AS (${consumptionLinesSql(range)})${byCategory ? `, ${bucketCte(assetCategoryId)}` : ''},
    scoped AS (
      SELECT x.*, ${byCategory ? 'b.ancestor_id' : 'x.asset_id'} AS group_id
      FROM x
      JOIN assets a ON a.id = x.asset_id
      JOIN products p ON p.id = x.product_id
      ${byCategory ? 'JOIN bucket b ON b.leaf_id = a.asset_category_id' : ''}
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    )`;
  const replacements = { ...dayBounds({ from, to }), productId, productCategoryIds, assetId, assetCategoryId, assetCategoryIds, limit, offset: (page - 1) * limit };

  const group = byCategory
    ? {
        json: `json_build_object('id', g.id, 'code', g.code, 'name', g.name,
                 'isLeaf', NOT EXISTS (SELECT 1 FROM asset_categories k WHERE k.parent_id = g.id)) AS "assetCategory"`,
        join: 'JOIN asset_categories g ON g.id = x.group_id',
        keys: 'g.id, g.code, g.name',
        order: 'g.name COLLATE natural_sort, g.id',
      }
    : {
        json: `json_build_object('id', g.id, 'code', g.code, 'name', g.name, 'isActive', g.is_active,
                 'category', json_build_object('id', gc.id, 'code', gc.code, 'name', gc.name)) AS asset`,
        join: 'JOIN assets g ON g.id = x.group_id JOIN asset_categories gc ON gc.id = g.asset_category_id',
        keys: 'g.id, g.code, g.name, g.is_active, gc.id, gc.code, gc.name',
        order: 'g.code COLLATE natural_sort, g.id',
      };

  const [rows, products, [counts]] = await Promise.all([
    sequelize.query(
      `${scope}
       SELECT ${group.json}, ${PRODUCT_JSON} AS product, ${SUMS}, count(*) OVER ()::int AS "totalItems"
       FROM scoped x ${group.join}
       JOIN products p ON p.id = x.product_id JOIN units u ON u.id = p.unit_id
       GROUP BY ${group.keys}, p.id, p.code, p.name, u.code
       ORDER BY ${group.order}, p.code
       LIMIT :limit OFFSET :offset`,
      { replacements, type: QueryTypes.SELECT }
    ),
    sequelize.query(
      `${scope}
       SELECT ${PRODUCT_JSON} AS product, ${SUMS}
       FROM scoped x JOIN products p ON p.id = x.product_id JOIN units u ON u.id = p.unit_id
       GROUP BY p.id, p.code, p.name, u.code
       ORDER BY p.code`,
      { replacements, type: QueryTypes.SELECT }
    ),
    sequelize.query(`${scope} SELECT count(DISTINCT group_id)::int AS groups, count(*)::int AS lines FROM scoped`, {
      replacements,
      type: QueryTypes.SELECT,
    }),
  ]);
  return { items: rows, total: rows[0]?.totalItems ?? 0, products, groups: counts.groups, lines: counts.lines };
};

// --- Movimientos por período (HU-502) ------------------------------------------------------------

/**
 * Patas firmadas de cada línea por almacén, como v_kardex pero con el id de la línea y la referencia:
 * una entrada suma en destino, una salida resta en origen, un traslado resta en origen y suma en
 * destino, y un ajuste suma (SOBRANTE) o resta (FALTANTE). Con almacén, solo cuentan sus patas.
 */
const movementLegsSql = (where) => `
  SELECT h.id AS movement_id, h.movement_type::text AS movement_type, h.reason::text AS reason, h.movement_date, h.reference,
         l.id AS line_id, l.product_id, k.warehouse_id, k.delta
  FROM movement_headers h
  JOIN movement_lines l ON l.movement_header_id = h.id
  CROSS JOIN LATERAL (VALUES (h.warehouse_from_id, -l.quantity), (h.warehouse_to_id, l.quantity)) AS k(warehouse_id, delta)
  WHERE k.warehouse_id IS NOT NULL ${where.map((condition) => `AND ${condition}`).join(' ')}`;

const signedSum = (filter, sign = '') => `COALESCE(${sign}sum(x.delta) FILTER (WHERE ${filter}), 0)::text`;

const MOVEMENT_SUMS = `
  ${signedSum("x.movement_type = 'IN'")} AS entries,
  ${signedSum("x.movement_type = 'OUT'", '-')} AS exits,
  ${signedSum("x.movement_type = 'TRANSFER' AND x.delta > 0")} AS "transfersIn",
  ${signedSum("x.movement_type = 'TRANSFER' AND x.delta < 0", '-')} AS "transfersOut",
  ${signedSum("x.movement_type = 'ADJUST' AND x.delta > 0")} AS "adjustmentsIn",
  ${signedSum("x.movement_type = 'ADJUST' AND x.delta < 0", '-')} AS "adjustmentsOut",
  COALESCE(sum(x.delta), 0)::text AS net,
  count(DISTINCT x.movement_id)::int AS documents,
  count(DISTINCT x.line_id)::int AS lines`;

const TYPE_ORDER = `array_position(ARRAY['IN', 'OUT', 'TRANSFER', 'ADJUST'], x.movement_type)`;

/**
 * Movimientos del período por producto (paginado), con el resumen de todo el alcance: totales, conteo
 * por tipo y motivo (con cuántos son correcciones REV-) y la serie por día, semana o mes en la hora
 * del servidor. Filtros: from y to ('AAAA-MM-DD' inclusive), movementType, reason, warehouseId,
 * productId y productCategoryIds (ya con subcategorías). Las cantidades vuelven como texto NUMERIC.
 */
export const findMovementsSummary = async ({ from, to, movementType, reason, warehouseId, productId, productCategoryIds, interval, page, limit }) => {
  const where = [
    from && 'h.movement_date >= :fromStart',
    to && 'h.movement_date < :toEnd',
    movementType && 'h.movement_type = :movementType',
    reason && 'h.reason = :reason',
    warehouseId && 'k.warehouse_id = :warehouseId',
    productId && 'l.product_id = :productId',
    productCategoryIds && 'l.product_id IN (SELECT id FROM products WHERE product_category_id IN (:productCategoryIds))',
  ].filter(Boolean);
  const scope = `WITH x AS (${movementLegsSql(where)})`;
  const replacements = {
    ...dayBounds({ from, to }),
    movementType,
    reason,
    warehouseId,
    productId,
    productCategoryIds,
    interval,
    timeZone: SERVER_TIME_ZONE,
    limit,
    offset: (page - 1) * limit,
  };
  const select = (sql) => sequelize.query(sql, { replacements, type: QueryTypes.SELECT });

  const [rows, [totals], byReason, byPeriod] = await Promise.all([
    select(
      `${scope}
       SELECT ${PRODUCT_JSON} AS product, ${MOVEMENT_SUMS}, max(x.movement_date) AS "lastMovementAt", count(*) OVER ()::int AS "totalItems"
       FROM x JOIN products p ON p.id = x.product_id JOIN units u ON u.id = p.unit_id
       GROUP BY p.id, p.code, p.name, u.code
       ORDER BY p.code COLLATE natural_sort, p.id
       LIMIT :limit OFFSET :offset`
    ),
    select(`${scope} SELECT count(DISTINCT movement_id)::int AS documents, count(DISTINCT line_id)::int AS lines, count(DISTINCT product_id)::int AS products FROM x`),
    select(
      `${scope}
       SELECT x.movement_type AS "movementType", x.reason, count(DISTINCT x.movement_id)::int AS documents, count(DISTINCT x.line_id)::int AS lines,
              count(DISTINCT x.movement_id) FILTER (WHERE x.reference LIKE '${CORRECTION_REFERENCE_PREFIX}%')::int AS corrections
       FROM x GROUP BY x.movement_type, x.reason
       ORDER BY ${TYPE_ORDER}, x.reason`
    ),
    select(
      `${scope}
       SELECT to_char(date_trunc(:interval, x.movement_date AT TIME ZONE :timeZone), 'YYYY-MM-DD') AS period,
              count(DISTINCT x.movement_id) FILTER (WHERE x.movement_type = 'IN')::int AS "IN",
              count(DISTINCT x.movement_id) FILTER (WHERE x.movement_type = 'OUT')::int AS "OUT",
              count(DISTINCT x.movement_id) FILTER (WHERE x.movement_type = 'TRANSFER')::int AS "TRANSFER",
              count(DISTINCT x.movement_id) FILTER (WHERE x.movement_type = 'ADJUST')::int AS "ADJUST",
              count(DISTINCT x.movement_id)::int AS documents
       FROM x GROUP BY 1 ORDER BY 1`
    ),
  ]);
  return { items: rows, total: rows[0]?.totalItems ?? 0, totals, byReason, byPeriod };
};
