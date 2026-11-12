// Unidades de naming_conventions.md §5. Primero las base, luego las derivadas.
export const up = async (queryInterface) => {
  await queryInterface.sequelize.query(`
    INSERT INTO units (code, name) VALUES
      ('L',    'Litro'),
      ('KG',   'Kilogramo'),
      ('UND',  'Unidad'),
      ('CAJA', 'Caja');

    INSERT INTO units (code, name, base_unit_id, conversion_factor)
    SELECT v.code, v.name, b.id, v.factor
    FROM (VALUES
      ('ML',   'Mililitro',      'L',   0.001),
      ('GAL',  'Galón',          'L',   3.785411),
      ('TAMB', 'Tambor (208 L)', 'L',   208),
      ('G',    'Gramo',          'KG',  0.001),
      ('SACO', 'Saco (50 kg)',   'KG',  50),
      ('TON',  'Tonelada',       'KG',  1000),
      ('PAR',  'Par',            'UND', 2)
    ) AS v(code, name, base_code, factor)
    JOIN units b ON b.code = v.base_code;
  `);
};

export const down = async (queryInterface) => {
  await queryInterface.sequelize.query(`
    DELETE FROM units WHERE code IN ('ML', 'GAL', 'TAMB', 'G', 'SACO', 'TON', 'PAR');
    DELETE FROM units WHERE code IN ('L', 'KG', 'UND', 'CAJA');
  `);
};
