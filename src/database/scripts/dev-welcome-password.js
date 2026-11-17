// SOLO DESARROLLO. Muestra la contraseña temporal del último correo WELCOME pendiente.
//
//   pnpm dev:welcome-password pedro.gomez@aztlan.local
//
// Hace lo mismo que el worker de correos al enviar el WELCOME: genera la contraseña temporal con
// prepareWelcomeForDelivery (en la BD solo queda su hash). Sirve para probar el alta de usuarios
// desde Postman con el worker apagado (EMAIL_WORKER_ENABLED=false). Cada ejecución genera una
// contraseña nueva y deja sin efecto la anterior.
import { pathToFileURL } from 'node:url';
import { sequelize } from '../../config/database.js';
import { EmailOutbox } from '../models/index.model.js';
import { prepareWelcomeForDelivery } from '../../modules/auth/auth.service.js';
import { EMAIL_STATUS, EMAIL_TEMPLATES } from '../../shared/constants/email.js';
import { AppError } from '../../shared/errors/AppError.js';

export const devWelcomePassword = async (email) => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Este comando es solo para desarrollo: en producción la contraseña temporal solo viaja por correo.');
  }
  if (!email) throw new AppError('VALIDATION_ERROR', { message: 'Indique el correo: pnpm dev:welcome-password usuario@dominio' });

  const outbox = await EmailOutbox.findOne({
    where: { toEmail: email.trim().toLowerCase(), template: EMAIL_TEMPLATES.WELCOME, status: EMAIL_STATUS.PENDING },
    order: [['id', 'DESC']],
  });
  if (!outbox?.userId) {
    throw new AppError('NOT_FOUND', {
      message: `No hay un correo de bienvenida pendiente para ${email}. Cree el usuario con POST /api/users (con el worker apagado).`,
    });
  }

  const prepared = await prepareWelcomeForDelivery(outbox.userId);
  if (!prepared) {
    throw new AppError('INACTIVE_RESOURCE', { message: 'El usuario ya inició sesión, ya fijó su contraseña o está desactivado.' });
  }
  return prepared;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { temporaryPassword } = await devWelcomePassword(process.argv[2]);
    process.stdout.write(`\nContraseña temporal:\n  ${temporaryPassword}\n\n`);
    process.exitCode = 0;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}
