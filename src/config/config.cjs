// Única fuente de la configuración de conexión: la usan sequelize-cli y la app (database.js).
require('dotenv').config({ quiet: true });

const base = {
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 5432,
  dialect: process.env.DB_DIALECT || 'postgres',
  logging: false,
};

module.exports = {
  development: { ...base, database: process.env.DB_NAME },
  // Las pruebas nunca usan la base de desarrollo: por defecto, "<DB_NAME>_test".
  test: { ...base, database: process.env.DB_NAME_TEST || `${process.env.DB_NAME}_test` },
  production: { ...base, database: process.env.DB_NAME },
};
