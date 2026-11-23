// Referencia automática de las órdenes de retiro: {ALMACÉN}-{AÑO}-{NNNNNN}, por ejemplo TALL-2026-000001.
// Un correlativo por almacén y por año (el de la fecha del movimiento), de 1 a 999999. Se incrementa
// con INSERT … ON CONFLICT … RETURNING dentro de la transacción de la orden: la fila queda bloqueada
// hasta el commit, así que no hay huecos ni repetidos, y un rollback devuelve el número.
// El índice único parcial es la red de seguridad: dos órdenes no pueden tener la misma referencia
// automática (las referencias REV- de las correcciones, HU-406, no entran en el índice).
export const up = async (queryInterface) => {
  await queryInterface.sequelize.query(`
    CREATE TABLE withdrawal_reference_sequences (
      warehouse_id INTEGER  NOT NULL,
      year         SMALLINT NOT NULL,
      last_number  INTEGER  NOT NULL DEFAULT 0,
      CONSTRAINT pk_withdrawal_reference_sequences PRIMARY KEY (warehouse_id, year),
      CONSTRAINT fk_withdrawal_reference_sequences_warehouse_id FOREIGN KEY (warehouse_id)
        REFERENCES warehouses(id) ON DELETE RESTRICT,
      CONSTRAINT chk_withdrawal_reference_sequences_year CHECK (year BETWEEN 2000 AND 2999),
      CONSTRAINT chk_withdrawal_reference_sequences_max CHECK (last_number BETWEEN 0 AND 999999)
    );

    CREATE UNIQUE INDEX uq_movement_headers_withdrawal_reference
      ON movement_headers (reference)
      WHERE movement_type = 'OUT' AND reference ~ '^[A-Z0-9]{4}-[0-9]{4}-[0-9]{6}$';
  `);
};

export const down = async (queryInterface) => {
  await queryInterface.sequelize.query(`
    DROP INDEX IF EXISTS uq_movement_headers_withdrawal_reference;
    DROP TABLE IF EXISTS withdrawal_reference_sequences;
  `);
};
