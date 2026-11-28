// Saldos de stock por producto y almacén (db_schema.md §4). No valida: el service de movimientos
// decide con las filas ya bloqueadas. Las cantidades NUMERIC(14,3) viajan como texto.
import { QueryTypes } from 'sequelize';
import { sequelize } from '#src/config/database.js';
import { dayBounds } from '#src/shared/schemas/dates.js';

/**
 * Bloquea FOR UPDATE las filas de stock de esos productos en el almacén, en orden ascendente de
 * product_id (business_rules.md P4: mismo orden en todas las transacciones, sin deadlocks). Devuelve
 * Map(productId → cantidad en texto). Un producto sin fila no tiene existencia en ese almacén.
 */
export const lockStockRows = async (warehouseId, productIds, { transaction }) => {
  if (!productIds.length) return new Map();
  const rows = await sequelize.query(
    `SELECT product_id AS "productId", quantity::text AS quantity
     FROM stock
     WHERE warehouse_id = :warehouseId AND product_id IN (:productIds)
     ORDER BY product_id
     FOR UPDATE`,
    { replacements: { warehouseId, productIds }, type: QueryTypes.SELECT, transaction }
  );
  return new Map(rows.map((row) => [row.productId, row.quantity]));
};

/** Resta en SQL sobre la fila ya bloqueada; el CHECK (quantity >= 0) es la última barrera. */
export const decrementStock = async (warehouseId, productId, quantity, { transaction }) => {
  await sequelize.query(
    `UPDATE stock SET quantity = quantity - :quantity::numeric, last_update = now()
     WHERE warehouse_id = :warehouseId AND product_id = :productId`,
    { replacements: { warehouseId, productId, quantity }, transaction }
  );
};

/** Entradas (HU-402): crea la fila si no existe y suma. */
export const incrementStock = async (warehouseId, productId, quantity, { transaction }) => {
  await sequelize.query(
    `INSERT INTO stock (product_id, warehouse_id, quantity, last_update)
     VALUES (:productId, :warehouseId, :quantity::numeric, now())
     ON CONFLICT (product_id, warehouse_id)
     DO UPDATE SET quantity = stock.quantity + EXCLUDED.quantity, last_update = now()`,
    { replacements: { productId, warehouseId, quantity }, transaction }
  );
};

/**
 * Existencia total (todos los almacenes), mínimo y máximo de cada producto, para los avisos de bajo
 * mínimo y sobre máximo (business_rules.md §7). Dentro de la transacción ve el stock ya descontado.
 */
export const findStockTotals = async (productIds, { transaction } = {}) => {
  if (!productIds.length) return [];
  return sequelize.query(
    `SELECT p.id AS "productId", p.code, p.name, u.code AS "unitCode", p.min_stock::text AS "minStock", p.max_stock::text AS "maxStock",
            COALESCE(sum(s.quantity), 0)::text AS total
     FROM products p
     JOIN units u ON u.id = p.unit_id
     LEFT JOIN stock s ON s.product_id = p.id
     WHERE p.id IN (:productIds)
     GROUP BY p.id, p.code, p.name, u.code, p.min_stock, p.max_stock
     ORDER BY p.id`,
    { replacements: { productIds }, type: QueryTypes.SELECT, transaction }
  );
};

/** Existencia de cada producto en un almacén, para el formulario de la orden de retiro. */
export const findAvailability = async (warehouseId, productIds) => {
  if (!productIds.length) return [];
  return sequelize.query(
    `SELECT p.id AS "productId", p.code, u.code AS "unitCode", COALESCE(s.quantity, 0)::text AS available
     FROM products p
     JOIN units u ON u.id = p.unit_id
     LEFT JOIN stock s ON s.product_id = p.id AND s.warehouse_id = :warehouseId
     WHERE p.id IN (:productIds)
     ORDER BY p.id`,
    { replacements: { warehouseId, productIds }, type: QueryTypes.SELECT }
  );
};

// --- Consulta de existencias (HU-407) ---------------------------------------------------------

/**
 * Estado de un producto según su stock total en todos los almacenes (business_rules.md §7), el mismo
 * criterio que v_stock_alerts.
 */
const STATUS_SQL = `CASE WHEN COALESCE(t.total, 0) < p.min_stock THEN 'BAJO_MINIMO'
                         WHEN p.max_stock IS NOT NULL AND COALESCE(t.total, 0) > p.max_stock THEN 'SOBRE_MAXIMO'
                         ELSE 'NORMAL' END`;

/**
 * Existencias de los productos activos, filtradas y paginadas.
 *  - groupBy 'product': una fila por producto con su total y el desglose por almacén. Con warehouseId,
 *    solo los productos con existencia en ese almacén, y quantity es la de ese almacén.
 *  - groupBy 'warehouse': una fila por producto y almacén con existencia (> 0).
 * status filtra por estado ('BAJO_MINIMO', 'SOBRE_MAXIMO' o 'CON_ALERTA'). summary cuenta los
 * productos por estado con los mismos filtros, sin el de estado.
 */
export const listStock = async ({ groupBy, page, limit, search, warehouseId, categoryIds, status }) => {
  const byWarehouse = groupBy === 'warehouse';
  const where = ['p.is_active'];
  if (categoryIds) where.push('p.product_category_id IN (:categoryIds)');
  if (search) where.push('(p.code ILIKE :pattern OR p.name ILIKE :pattern)');
  if (byWarehouse) {
    where.push('s.quantity > 0');
    if (warehouseId) where.push('s.warehouse_id = :warehouseId');
  } else if (warehouseId) {
    where.push('ws.quantity > 0');
  }
  const base = `
    SELECT p.id AS "productId", p.code AS "productCode", p.name AS "productName", u.code AS "unitCode",
           c.id AS "categoryId", c.code AS "categoryCode", c.name AS "categoryName",
           p.min_stock::text AS "minStock", p.max_stock::text AS "maxStock",
           COALESCE(t.total, 0)::text AS total,
           ${STATUS_SQL} AS status,
           ${
             byWarehouse
               ? `w.id AS "warehouseId", w.code AS "warehouseCode", w.name AS "warehouseName", s.quantity::text AS quantity, NULL::json AS warehouses`
               : `${warehouseId ? `w.id AS "warehouseId", w.code AS "warehouseCode", w.name AS "warehouseName", ws.quantity::text` : `NULL::int AS "warehouseId", NULL AS "warehouseCode", NULL AS "warehouseName", COALESCE(t.total, 0)::text`} AS quantity,
                  (SELECT json_agg(json_build_object('id', w2.id, 'code', w2.code, 'name', w2.name, 'quantity', s2.quantity::text) ORDER BY w2.code)
                   FROM stock s2 JOIN warehouses w2 ON w2.id = s2.warehouse_id
                   WHERE s2.product_id = p.id AND s2.quantity > 0) AS warehouses`
           }
    FROM products p
    JOIN units u ON u.id = p.unit_id
    JOIN product_categories c ON c.id = p.product_category_id
    LEFT JOIN (SELECT product_id, sum(quantity) AS total FROM stock GROUP BY product_id) t ON t.product_id = p.id
    ${byWarehouse ? 'JOIN stock s ON s.product_id = p.id JOIN warehouses w ON w.id = s.warehouse_id' : ''}
    ${!byWarehouse && warehouseId ? 'JOIN stock ws ON ws.product_id = p.id AND ws.warehouse_id = :warehouseId JOIN warehouses w ON w.id = ws.warehouse_id' : ''}
    WHERE ${where.join(' AND ')}`;
  const statusWhere =
    status === 'CON_ALERTA' ? "WHERE x.status <> 'NORMAL'" : status ? 'WHERE x.status = :status' : '';
  const replacements = {
    categoryIds,
    warehouseId,
    status,
    pattern: search ? `%${search.replace(/[\%_]/g, (ch) => `\${ch}`)}%` : null,
    limit,
    offset: (page - 1) * limit,
  };
  const [rows, [{ total }], summaryRows] = await Promise.all([
    sequelize.query(`SELECT * FROM (${base}) x ${statusWhere} ORDER BY x."productCode", x."warehouseCode" NULLS FIRST LIMIT :limit OFFSET :offset`, {
      replacements,
      type: QueryTypes.SELECT,
    }),
    sequelize.query(`SELECT count(*)::int AS total FROM (${base}) x ${statusWhere}`, { replacements, type: QueryTypes.SELECT }),
    // El resumen cuenta productos (no filas): en la vista por almacén un producto aparece varias veces.
    sequelize.query(`SELECT x.status, count(DISTINCT x."productId")::int AS count FROM (${base}) x GROUP BY x.status`, { replacements, type: QueryTypes.SELECT }),
  ]);
  return { items: rows, total, summary: summaryRows };
};

// --- Kardex (HU-409) -----------------------------------------------------------------------------

/**
 * Orden cronológico del kardex: fecha, movimiento y, dentro de un movimiento, las salidas antes que
 * las entradas (en un traslado con todos los almacenes, primero sale del origen y luego entra al destino).
 */
const KARDEX_ORDER = 'k.movement_date, k.movement_id, k.delta, k.asset_id NULLS FIRST, k.warehouse_id';

/**
 * Kardex de un producto (v_kardex), en un almacén o en todos. El saldo se acumula sobre toda la
 * historia y después se filtra por fechas y se pagina: es correcto en cualquier página y rango.
 * from/to: 'AAAA-MM-DD' inclusive. Devuelve { items, total, summary: { opening, inQty, outQty } }.
 */
export const findKardex = async ({ productId, warehouseId, from, to, page, limit }) => {
  const scope = `k.product_id = :productId${warehouseId ? ' AND k.warehouse_id = :warehouseId' : ''}`;
  const range = [from && 'x.movement_date >= :fromStart', to && 'x.movement_date < :toEnd'].filter(Boolean);
  const rangeWhere = range.length ? `WHERE ${range.join(' AND ')}` : '';
  const replacements = { productId, warehouseId, ...dayBounds({ from, to }), limit, offset: (page - 1) * limit };
  const running = `
    SELECT k.*, sum(k.delta) OVER (ORDER BY ${KARDEX_ORDER} ROWS UNBOUNDED PRECEDING) AS balance,
           row_number() OVER (ORDER BY ${KARDEX_ORDER}) AS rn
    FROM v_kardex k WHERE ${scope}`;
  const [items, [summary]] = await Promise.all([
    sequelize.query(
      `SELECT x.movement_id AS "movementId", x.document_number AS "documentNumber", x.movement_date AS "movementDate",
              x.movement_type AS "movementType", x.reason, h.reference,
              x.delta::text AS delta, x.balance::text AS balance,
              w.id AS "warehouseId", w.code AS "warehouseCode", w.name AS "warehouseName",
              a.id AS "assetId", a.code AS "assetCode", a.name AS "assetName"
       FROM (${running}) x
       JOIN movement_headers h ON h.id = x.movement_id
       JOIN warehouses w ON w.id = x.warehouse_id
       LEFT JOIN assets a ON a.id = x.asset_id
       ${rangeWhere}
       ORDER BY x.rn
       LIMIT :limit OFFSET :offset`,
      { replacements, type: QueryTypes.SELECT }
    ),
    sequelize.query(
      `SELECT count(*) FILTER (WHERE ${range.length ? range.join(' AND ') : 'true'})::int AS total,
              COALESCE(sum(x.delta) FILTER (WHERE ${from ? 'x.movement_date < :fromStart' : 'false'}), 0)::text AS opening,
              COALESCE(sum(x.delta) FILTER (WHERE x.delta > 0 AND ${range.length ? range.join(' AND ') : 'true'}), 0)::text AS "inQty",
              COALESCE(-sum(x.delta) FILTER (WHERE x.delta < 0 AND ${range.length ? range.join(' AND ') : 'true'}), 0)::text AS "outQty"
       FROM v_kardex x WHERE ${scope.replaceAll('k.', 'x.')}`,
      { replacements, type: QueryTypes.SELECT }
    ),
  ]);
  return { items, total: summary.total, summary: { opening: summary.opening, inQty: summary.inQty, outQty: summary.outQty } };
};
