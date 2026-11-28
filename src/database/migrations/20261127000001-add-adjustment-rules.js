// Ajustes por conteo físico (HU-404, business_rules.md §2.5 reglas 3 y 4). Un ajuste (ADJUST) siempre
// lleva el acta de conteo físico como referencia (CF-AAAA-NNN, naming_conventions.md §8.2) y una
// observación con la causa. Las correcciones de HU-406 podrán usar REV-AJU-NNNNNN.
// Los CHECK de un solo almacén (chk_movement_warehouses), del motivo AJUSTE y del prefijo AJU- ya existen.
export const up = async (queryInterface) => {
  await queryInterface.sequelize.query(`
    ALTER TABLE movement_headers
      ADD CONSTRAINT chk_movement_headers_adjust_reference
        -- IS NOT NULL explícito: un CHECK que da NULL (reference NULL) se considera cumplido.
        CHECK (movement_type <> 'ADJUST' OR (reference IS NOT NULL AND reference ~ '^(CF-[0-9]{4}-[0-9]{3,6}|REV-AJU-[0-9]{6})$')),
      ADD CONSTRAINT chk_movement_headers_adjust_note
        CHECK (movement_type <> 'ADJUST' OR (note IS NOT NULL AND btrim(note) <> ''));
  `);
};

export const down = async (queryInterface) => {
  await queryInterface.sequelize.query(`
    ALTER TABLE movement_headers
      DROP CONSTRAINT IF EXISTS chk_movement_headers_adjust_note,
      DROP CONSTRAINT IF EXISTS chk_movement_headers_adjust_reference;
  `);
};
