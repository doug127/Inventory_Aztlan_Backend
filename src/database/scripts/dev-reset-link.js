// SOLO DESARROLLO. Muestra el enlace de recuperación del último correo PASSWORD_RESET pendiente.
//
//   pnpm dev:reset-link pedro.gomez@aztlan.local
//
// Hace lo mismo que hará el worker de correos (HU-106) al enviar el correo: genera el token en
// claro con prepareResetTokenForDelivery (en la BD solo queda su hash) y arma el enlace. Mientras
// no exista el envío real, permite probar el flujo completo de recuperación desde Postman.
// Cada ejecución genera un token nuevo y deja sin efecto el enlace anterior.
import { pathToFileURL } from 'node:url';
import { sequelize } from '../../config/database.js';
import { EmailOutbox } from '../models/index.model.js';
import { prepareResetTokenForDelivery } from '../../modules/auth/auth.service.js';
import { EMAIL_STATUS, EMAIL_TEMPLATES } from '../../shared/constants/email.js';
import { AppError } from '../../shared/errors/AppError.js';

export const buildResetLink = (token) =>
  `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${encodeURIComponent(token)}`;

export const devResetLink = async (email) => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Este comando es solo para desarrollo: en producción el enlace solo viaja por correo.');
  }
  if (!email) throw new AppError('VALIDATION_ERROR', { message: 'Indique el correo: pnpm dev:reset-link usuario@dominio' });

  const outbox = await EmailOutbox.findOne({
    where: { toEmail: email.trim().toLowerCase(), template: EMAIL_TEMPLATES.PASSWORD_RESET, status: EMAIL_STATUS.PENDING },
    order: [['id', 'DESC']],
  });
  if (!outbox?.passwordResetTokenId) {
    throw new AppError('NOT_FOUND', {
      message: `No hay una solicitud de recuperación pendiente para ${email}. Llame primero a POST /api/auth/forgot-password.`,
    });
  }

  const prepared = await prepareResetTokenForDelivery(outbox.passwordResetTokenId);
  if (!prepared) {
    throw new AppError('INACTIVE_RESOURCE', {
      message: 'El token de esa solicitud ya se usó o fue reemplazado por una solicitud más reciente.',
    });
  }
  return { ...prepared, link: buildResetLink(prepared.token) };
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { token, expiresAt, link } = await devResetLink(process.argv[2]);
    process.stdout.write(
      `\nEnlace de recuperación (vence ${expiresAt.toISOString()}):\n  ${link}\n\nToken para Postman:\n  ${token}\n\n`
    );
    process.exitCode = 0;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}
