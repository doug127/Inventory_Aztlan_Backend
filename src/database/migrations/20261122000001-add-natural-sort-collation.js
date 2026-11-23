// Orden natural para códigos y nombres con números (agrupación de activos por lote).
// Con el orden de texto común "Lote 10" queda antes que "Lote 2" y "TB-1000" antes que "TB-200".
// La intercalación ICU con numeric ordering (kn) compara los números por su valor. Es determinista,
// así que se puede usar en ORDER BY, min() y max(); no se aplica a las columnas para no afectar los
// UNIQUE ni las búsquedas con ILIKE.
export const up = async (queryInterface) => {
  await queryInterface.sequelize.query(`CREATE COLLATION IF NOT EXISTS natural_sort (provider = icu, locale = 'und-u-kn-true')`);
};

export const down = async (queryInterface) => {
  await queryInterface.sequelize.query('DROP COLLATION IF EXISTS natural_sort');
};
