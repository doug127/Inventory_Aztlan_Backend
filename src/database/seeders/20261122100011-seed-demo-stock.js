// Existencias iniciales de demostración: una nota de entrada (IN COMPRA) por almacén con los
// productos sembrados. Así se pueden probar las órdenes de retiro (HU-401) antes de que existan las
// entradas en la interfaz (HU-402). Respeta el principio P2: el stock nace de movimientos, con su
// número ENT- correlativo, y v_kardex cuadra con stock.
//   pnpm db:seed:demo-stock
// Es idempotente (si ya existe la referencia FAC-DEMO-0001 no hace nada) y no corre en producción
// ni en la base de pruebas.
const REFERENCE = 'FAC-DEMO-0001';

// Cantidades pensadas para probar la orden de retiro: el mismo producto en dos almacenes (diésel y
// aceite en COMB y TALL), y algunos cerca de su mínimo para ver el aviso (grasa, filtros, glifosato).
const ENTRIES = {
  COMB: [
    ['COMB-0001', 3000],
    ['COMB-0002', 400],
    ['LUBR-0001', 200],
    ['LUBR-0002', 40],
  ],
  TALL: [
    ['COMB-0001', 150],
    ['LUBR-0001', 60],
    ['LUBR-0002', 12],
    ['FILT-0001', 6],
  ],
  PRIN: [
    ['EPPS-0001', 60],
    ['FERT-0001', 800],
    ['HERB-0001', 25],
  ],
  REPU: [['FILT-0001', 24]],
};

export const up = async (queryInterface) => {
  const { sequelize } = queryInterface;
  if (process.env.NODE_ENV === 'production' || sequelize.getDatabaseName().endsWith('_test')) return;

  await sequelize.transaction(async (transaction) => {
    const q = (sql, replacements) => sequelize.query(sql, { replacements, transaction, type: sequelize.QueryTypes.SELECT });
    const [done] = await q('SELECT 1 FROM movement_headers WHERE reference LIKE :ref LIMIT 1', { ref: `${REFERENCE}%` });
    if (done) return;
    const [admin] = await q(
      "SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE r.code = 'SUPERADMIN' AND u.is_active ORDER BY u.id LIMIT 1"
    );
    if (!admin) throw new Error('Ejecute primero las semillas base: falta el SUPERADMIN.');

    for (const [warehouseCode, lines] of Object.entries(ENTRIES)) {
      // Un almacén desactivado no recibe movimientos nuevos.
      const [warehouse] = await q('SELECT id FROM warehouses WHERE code = :code AND is_active', { code: warehouseCode });
      if (!warehouse) continue;
      const [seq] = await q(
        "UPDATE document_sequences SET last_number = last_number + 1 WHERE movement_type = 'IN' RETURNING prefix, last_number AS n"
      );
      const [header] = await q(
        `INSERT INTO movement_headers (document_number, movement_type, reason, reference, created_by_user_id, warehouse_to_id, note)
         VALUES (:doc, 'IN', 'COMPRA', :ref, :userId, :warehouseId, 'Inventario inicial de demostración') RETURNING id`,
        { doc: `${seq.prefix}-${String(seq.n).padStart(6, '0')}`, ref: REFERENCE, userId: admin.id, warehouseId: warehouse.id }
      );
      for (const [productCode, quantity] of lines) {
        const [product] = await q('SELECT id FROM products WHERE code = :code', { code: productCode });
        if (!product) continue;
        await q('INSERT INTO movement_lines (movement_header_id, product_id, quantity) VALUES (:headerId, :productId, :quantity) RETURNING id', {
          headerId: header.id,
          productId: product.id,
          quantity,
        });
        await q(
          `INSERT INTO stock (product_id, warehouse_id, quantity) VALUES (:productId, :warehouseId, :quantity)
           ON CONFLICT (product_id, warehouse_id) DO UPDATE SET quantity = stock.quantity + EXCLUDED.quantity, last_update = now()
           RETURNING product_id`,
          { productId: product.id, warehouseId: warehouse.id, quantity }
        );
      }
    }
  });
};

// Los movimientos son inmutables: deshacer esta semilla exige recrear la base de desarrollo.
export const down = async () => {};
