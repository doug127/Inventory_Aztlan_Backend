// Almacenes de naming_conventions.md §4
export const up = async (queryInterface) => {
  await queryInterface.sequelize.query(`
    INSERT INTO warehouses (code, name) VALUES
      ('PRIN', 'Almacén Principal'),
      ('COMB', 'Almacén de Combustibles y Lubricantes'),
      ('AGRO', 'Almacén de Agroquímicos'),
      ('REPU', 'Almacén de Repuestos'),
      ('TALL', 'Almacén de Taller');
  `);
};

export const down = async (queryInterface) => {
  await queryInterface.sequelize.query(
    `DELETE FROM warehouses WHERE code IN ('PRIN', 'COMB', 'AGRO', 'REPU', 'TALL');`
  );
};
