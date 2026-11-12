// Punto de entrada: conecta la BD y levanta HTTP. La aplicación Express vive en app.js.
import app from './app.js';
import { sequelize } from '#src/config/database.js';
import { logger } from '#src/shared/logging/logger.js';

process.on('unhandledRejection', (reason) => {
  logger.error('APP', 'process', 'UNHANDLED_REJECTION', { msg: reason?.message ?? String(reason) }, reason?.stack);
});

process.on('uncaughtException', (error) => {
  logger.error('APP', 'process', 'UNCAUGHT_EXCEPTION', { msg: error.message }, error.stack);
  process.exit(1);
});

try {
  await sequelize.authenticate();
  logger.info('DB', 'postgres', 'CONNECTED', { db: process.env.DB_NAME });
} catch (error) {
  logger.error('DB', 'postgres', 'ERROR', { msg: error.message }, error.stack);
  process.exit(1);
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info('APP', 'server', 'LISTEN', { port: PORT, env: process.env.NODE_ENV });
});
