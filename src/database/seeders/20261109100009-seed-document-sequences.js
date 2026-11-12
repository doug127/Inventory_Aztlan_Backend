// Contadores correlativos sin huecos por tipo de movimiento (naming_conventions.md §8.1)
export const up = async (queryInterface) => {
  await queryInterface.sequelize.query(`
    INSERT INTO document_sequences (movement_type, prefix, last_number) VALUES
      ('IN',       'ENT', 0),
      ('OUT',      'RET', 0),
      ('TRANSFER', 'TRF', 0),
      ('ADJUST',   'AJU', 0);
  `);
};

export const down = async (queryInterface) => {
  await queryInterface.sequelize.query('DELETE FROM document_sequences;');
};
