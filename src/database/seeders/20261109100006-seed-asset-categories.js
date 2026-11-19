// Árbol de categorías de activos de naming_conventions.md §7.1, insertado por niveles.
// Las raíces llevan su icono (HU-301); las subcategorías muestran el de su raíz.
const LEVELS = [
  [
    ['VEHICULOS', 'Vehículos', null, 'tractor'],
    ['PERSONAL', 'Personal', null, 'users'],
    ['CAMPO', 'Campo', null, 'wheat'],
    ['TALLER', 'Taller', null, 'warehouse'],
    ['EXTERNO', 'Externo', null, 'handshake'],
  ],
  [
    ['MAQUINARIA_AGRICOLA', 'Maquinaria agrícola', 'VEHICULOS'],
    ['LINEA_AMARILLA', 'Línea amarilla', 'VEHICULOS'],
    ['TRANSPORTE', 'Transporte', 'VEHICULOS'],
    ['LOTE_1', 'Lote 1', 'CAMPO'],
    ['LOTE_2', 'Lote 2', 'CAMPO'],
  ],
  [
    ['TRACTOR', 'Tractor', 'MAQUINARIA_AGRICOLA'],
    ['COSECHADORA', 'Cosechadora', 'MAQUINARIA_AGRICOLA'],
    ['RETROEXCAVADORA', 'Retroexcavadora', 'LINEA_AMARILLA'],
    ['CARGADOR_FRONTAL', 'Cargador frontal', 'LINEA_AMARILLA'],
    ['CAMION', 'Camión', 'TRANSPORTE'],
    ['CAMIONETA', 'Camioneta', 'TRANSPORTE'],
  ],
];

export const up = async (queryInterface) => {
  for (const level of LEVELS) {
    for (const [code, name, parentCode, icon = null] of level) {
      await queryInterface.sequelize.query(
        `INSERT INTO asset_categories (code, name, parent_id, icon)
         VALUES (:code, :name, (SELECT id FROM asset_categories WHERE code = :parentCode), :icon);`,
        { replacements: { code, name, parentCode, icon } }
      );
    }
  }
};

export const down = async (queryInterface) => {
  for (const level of [...LEVELS].reverse()) {
    await queryInterface.sequelize.query('DELETE FROM asset_categories WHERE code IN (:codes);', {
      replacements: { codes: level.map(([code]) => code) },
    });
  }
};
