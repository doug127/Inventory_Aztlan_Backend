// Carga .env (JWT_SECRET, credenciales de la BD) antes de cada archivo de pruebas.
// NODE_ENV=test ya viene de vitest.config.js, así que la conexión apunta a <DB_NAME>_test.
import dotenv from 'dotenv';

dotenv.config({ quiet: true });
