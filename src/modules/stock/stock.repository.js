// Saldos de stock por producto y almacén (db_schema.md §4). No valida: el service de movimientos
// decide con las filas ya bloqueadas. Las cantidades NUMERIC(14,3) viajan como texto.
import { QueryTypes } from 'sequelize';
import { sequelize } from '#src/config/database.js';

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
