// Productos de ejemplo de naming_conventions.md §6.2 (sin stock: el stock solo nace de movimientos)
export const up = async (queryInterface) => {
  await queryInterface.sequelize.query(`
    INSERT INTO products (code, name, product_category_id, unit_id, min_stock, max_stock)
    SELECT v.code, v.name, c.id, u.id, v.min_stock, v.max_stock
    FROM (VALUES
      ('COMB-0001', 'Diésel',                       'COMB', 'L',   500.000, 10000.000),
      ('COMB-0002', 'Gasolina 91',                  'COMB', 'L',   100.000,  2000.000),
      ('LUBR-0001', 'Aceite de motor 15W40',        'LUBR', 'L',    50.000,   600.000),
      ('LUBR-0002', 'Grasa multipropósito',         'LUBR', 'KG',   10.000,   100.000),
      ('FERT-0001', 'Urea 46%',                     'FERT', 'KG',  500.000,  5000.000),
      ('HERB-0001', 'Glifosato 48%',                'HERB', 'L',    20.000,   400.000),
      ('FILT-0001', 'Filtro de aceite JD RE504836', 'FILT', 'UND',   4.000,    40.000),
      ('EPPS-0001', 'Guantes de carnaza',           'EPPS', 'PAR',  10.000,   100.000)
    ) AS v(code, name, category_code, unit_code, min_stock, max_stock)
    JOIN product_categories c ON c.code = v.category_code
    JOIN units u ON u.code = v.unit_code;
  `);
};

export const down = async (queryInterface) => {
  await queryInterface.sequelize.query(`
    DELETE FROM products WHERE code IN
      ('COMB-0001', 'COMB-0002', 'LUBR-0001', 'LUBR-0002', 'FERT-0001', 'HERB-0001', 'FILT-0001', 'EPPS-0001');
  `);
};
