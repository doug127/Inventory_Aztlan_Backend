// Orden de trabajo del taller en las órdenes de retiro (naming_conventions.md §8.2, prefijo OT).
// La referencia de los retiros es automática ({ALMACÉN}-{AÑO}-{NNNNNN}), así que el documento
// externo del taller va en su propio campo: OT- seguido de letras, números o guiones (OT-2026-0153).
// Solo las órdenes de retiro (OUT) la llevan. Agregar una columna no modifica los movimientos
// existentes: trg_movements_immutable solo actúa sobre UPDATE y DELETE de filas.
export const up = async (queryInterface) => {
  await queryInterface.sequelize.query(`
    ALTER TABLE movement_headers
      ADD COLUMN work_order VARCHAR(30),
      ADD CONSTRAINT chk_movement_headers_work_order_format
        CHECK (work_order IS NULL OR work_order ~ '^OT-[A-Z0-9][A-Z0-9-]{0,26}$'),
      ADD CONSTRAINT chk_movement_headers_work_order_type
        CHECK (work_order IS NULL OR movement_type = 'OUT');

    CREATE INDEX idx_movement_headers_work_order ON movement_headers (work_order) WHERE work_order IS NOT NULL;
  `);
};

export const down = async (queryInterface) => {
  await queryInterface.sequelize.query(`
    DROP INDEX IF EXISTS idx_movement_headers_work_order;
    ALTER TABLE movement_headers
      DROP CONSTRAINT IF EXISTS chk_movement_headers_work_order_type,
      DROP CONSTRAINT IF EXISTS chk_movement_headers_work_order_format,
      DROP COLUMN IF EXISTS work_order;
  `);
};
