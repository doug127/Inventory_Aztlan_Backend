// Categorías de productos de naming_conventions.md §6.1
export const up = async (queryInterface) => {
  await queryInterface.sequelize.query(`
    INSERT INTO product_categories (code, name) VALUES
      ('COMB', 'Combustibles'),
      ('LUBR', 'Lubricantes'),
      ('INSU', 'Insumos agrícolas'),
      ('REPU', 'Repuestos'),
      ('HERR', 'Herramientas'),
      ('EPPS', 'Equipos de protección personal');

    INSERT INTO product_categories (code, name, parent_id)
    SELECT v.code, v.name, p.id
    FROM (VALUES
      ('FERT', 'Fertilizantes', 'INSU'),
      ('HERB', 'Herbicidas',    'INSU'),
      ('INSE', 'Insecticidas',  'INSU'),
      ('FILT', 'Filtros',       'REPU'),
      ('NEUM', 'Neumáticos',    'REPU')
    ) AS v(code, name, parent_code)
    JOIN product_categories p ON p.code = v.parent_code;
  `);
};

export const down = async (queryInterface) => {
  await queryInterface.sequelize.query(`
    DELETE FROM product_categories WHERE code IN ('FERT', 'HERB', 'INSE', 'FILT', 'NEUM');
    DELETE FROM product_categories WHERE code IN ('COMB', 'LUBR', 'INSU', 'REPU', 'HERR', 'EPPS');
  `);
};
