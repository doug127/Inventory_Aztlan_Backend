// Activos de referencia de business_rules.md §6.6 (todos en categorías hoja)
const ASSETS = [
  ['T-01', 'John Deere 6110', 'TRACTOR'],
  ['T-02', 'Landini 100H', 'TRACTOR'],
  ['CO-01', 'Cosechadora Cameco', 'COSECHADORA'],
  ['RE-01', 'Retro CAT 416', 'RETROEXCAVADORA'],
  ['CG-01', 'Payloader 950', 'CARGADOR_FRONTAL'],
  ['CV-01', 'Camión Volteo Ford', 'CAMION'],
  ['CA-01', 'Toyota Hilux', 'CAMIONETA'],
  ['PE-TAL', 'Personal Taller', 'PERSONAL'],
  ['PE-ADM', 'Personal Administrativo', 'PERSONAL'],
  ['PE-CAM', 'Personal de Campo', 'PERSONAL'],
  ['TB-100', 'Tablón 100', 'LOTE_1'],
  ['TB-101', 'Tablón 101', 'LOTE_1'],
  ['TB-200', 'Tablón 200', 'LOTE_2'],
  ['TA-MEC', 'Taller Mecánico', 'TALLER'],
  ['EX-01', 'Contratista', 'EXTERNO'],
];

export const up = async (queryInterface) => {
  for (const [code, name, categoryCode] of ASSETS) {
    await queryInterface.sequelize.query(
      `INSERT INTO assets (code, name, asset_category_id)
       SELECT :code, :name, id FROM asset_categories WHERE code = :categoryCode;`,
      { replacements: { code, name, categoryCode } }
    );
  }
};

export const down = async (queryInterface) => {
  await queryInterface.sequelize.query('DELETE FROM assets WHERE code IN (:codes);', {
    replacements: { codes: ASSETS.map(([code]) => code) },
  });
};
