import { AppError } from '#src/shared/errors/AppError.js';
import { EMAIL_SUBJECTS, EMAIL_TEMPLATES } from '#src/shared/constants/email.js';
import * as emailRepository from './email.repository.js';

/**
 * Encola un correo en email_outbox (patrón outbox). Se llama dentro de la misma transacción que
 * produce el hecho (bloqueo, alta de usuario, recuperación), así el correo existe si y solo si
 * el cambio se confirmó. El envío real y sus reintentos los hace el worker de HU-106.
 */
export const enqueueEmail = async ({ userId = null, toEmail, template, passwordResetTokenId = null }, { transaction } = {}) => {
  if (!Object.hasOwn(EMAIL_TEMPLATES, template)) {
    throw new AppError('INTERNAL_ERROR', { message: `Plantilla de correo desconocida: ${template}` });
  }
  return emailRepository.createEmail(
    { userId, toEmail, template, subject: EMAIL_SUBJECTS[template], passwordResetTokenId },
    { transaction }
  );
};
