// Procesa una vuelta de la cola de correos y termina. Útil para probar sin esperar al worker.
//
//   pnpm email:send-pending
import { sequelize } from '../../config/database.js';
import { processEmailBatch } from '../../modules/email/email.worker.js';
import { createMailTransport } from '../../modules/email/email.transport.js';

const transport = createMailTransport();
try {
  const result = await processEmailBatch({ transport });
  process.stdout.write(
    `Correos reclamados: ${result.claimed} · enviados: ${result.sent} · reprogramados: ${result.retried} · fallidos: ${result.failed}\n`
  );
  process.exitCode = 0;
} catch (error) {
  process.stderr.write(`No se pudo procesar la cola: ${error.message}\n`);
  process.exitCode = 1;
} finally {
  transport.close();
  await sequelize.close();
}
