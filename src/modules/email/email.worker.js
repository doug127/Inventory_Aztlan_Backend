// HU-106: worker que envía los correos de email_outbox con reintentos.
//
// Cada vuelta reclama correos PENDING vencidos, arma el cuerpo con su plantilla y los envía por
// SMTP. Si el envío falla, reprograma con espera creciente (1, 2, 4, 8 min); al agotar los
// intentos el correo queda FAILED con el motivo en last_error. Una falla del servidor de correo no
// pierde mensajes: quedan en la cola hasta que se puedan enviar.
import { EMAIL_TEMPLATES, EMAIL_WORKER_DEFAULTS } from '#src/shared/constants/email.js';
import { logger, maskEmail } from '#src/shared/logging/logger.js';
import { prepareResetTokenForDelivery, prepareWelcomeForDelivery } from '#src/modules/auth/auth.service.js';
import * as emailRepository from './email.repository.js';
import { renderEmail } from './email.templates.js';
import { createMailTransport, mailFrom } from './email.transport.js';

export const workerConfig = (env = process.env) => ({
  intervalMs: Number(env.EMAIL_WORKER_INTERVAL_MS) || EMAIL_WORKER_DEFAULTS.intervalMs,
  batchSize: Number(env.EMAIL_WORKER_BATCH_SIZE) || EMAIL_WORKER_DEFAULTS.batchSize,
  maxAttempts: Number(env.EMAIL_MAX_ATTEMPTS) || EMAIL_WORKER_DEFAULTS.maxAttempts,
  retryBaseMs: Number(env.EMAIL_RETRY_BASE_MS) || EMAIL_WORKER_DEFAULTS.retryBaseMs,
  leaseMs: EMAIL_WORKER_DEFAULTS.leaseMs,
});

/** Espera antes del siguiente intento: base, 2·base, 4·base… según los intentos ya hechos. */
export const retryDelayMs = (attempts, baseMs) => baseMs * 2 ** Math.max(0, attempts - 1);

const resetLink = (token) =>
  `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${encodeURIComponent(token)}`;

/** Un correo que ya no tiene sentido enviar (no es una falla del servidor de correo). */
class SkipEmail extends Error {}

/**
 * Datos que cada plantilla necesita en el momento del envío. Para PASSWORD_RESET aquí se genera
 * el token en claro (en la BD solo queda su hash): cada intento de envío lleva un token nuevo.
 */
const buildContext = async (email) => {
  const user = email.userId ? await emailRepository.findRecipient(email.userId) : null;
  if (!user) throw new SkipEmail('El destinatario ya no existe');
  const context = { user, occurredAt: email.createdAt };

  if (email.template === EMAIL_TEMPLATES.PASSWORD_RESET) {
    const prepared = email.passwordResetTokenId ? await prepareResetTokenForDelivery(email.passwordResetTokenId) : null;
    if (!prepared) throw new SkipEmail('Cancelado: el token de recuperación ya se usó o fue reemplazado');
    return { ...context, resetLink: resetLink(prepared.token), expiresAt: prepared.expiresAt };
  }
  if (email.template === EMAIL_TEMPLATES.WELCOME) {
    // HU-107: la contraseña temporal se genera aquí, igual que el token de recuperación.
    const prepared = await prepareWelcomeForDelivery(email.userId);
    if (!prepared) throw new SkipEmail('Cancelado: el usuario ya no está pendiente de su primer ingreso o fue desactivado');
    return { ...context, temporaryPassword: prepared.temporaryPassword };
  }
  return context;
};

const errorMessage = (error) => String(error?.message ?? error).slice(0, 1000);

/** Envía un correo ya reclamado y registra el resultado. Devuelve 'SENT' | 'RETRY' | 'FAILED'. */
const deliver = async (email, { transport, config, now }) => {
  const logInfo = { id: email.id, template: email.template, to: maskEmail(email.toEmail), attempt: email.attempts };
  try {
    const { subject, text, html } = renderEmail(email.template, await buildContext(email));
    const info = await transport.sendMail({ from: mailFrom(), to: email.toEmail, subject, text, html });
    await emailRepository.markSent(email.id, { sentAt: new Date(), providerMessageId: info?.messageId });
    logger.info('JOB', 'email-outbox', 'OK', logInfo);
    return 'SENT';
  } catch (error) {
    const lastError = errorMessage(error);
    if (error instanceof SkipEmail || email.attempts >= config.maxAttempts) {
      await emailRepository.markFailed(email.id, { lastError });
      logger.warn('JOB', 'email-outbox', 'FAILED', { ...logInfo, msg: lastError });
      return 'FAILED';
    }
    const scheduledAt = new Date(now.getTime() + retryDelayMs(email.attempts, config.retryBaseMs));
    await emailRepository.markRetry(email.id, { scheduledAt, lastError });
    logger.warn('JOB', 'email-outbox', 'RETRY', { ...logInfo, next: scheduledAt.toISOString(), msg: lastError });
    return 'RETRY';
  }
};

/** Procesa una vuelta de la cola. Devuelve cuántos correos se enviaron, reprogramaron o fallaron. */
export const processEmailBatch = async ({ transport = createMailTransport(), config = workerConfig(), now = new Date() } = {}) => {
  const claimed = await emailRepository.claimDueEmails({
    limit: config.batchSize,
    now,
    leaseUntil: new Date(now.getTime() + config.leaseMs),
  });

  const result = { claimed: claimed.length, sent: 0, retried: 0, failed: 0 };
  for (const email of claimed) {
    const outcome = await deliver(email, { transport, config, now });
    if (outcome === 'SENT') result.sent += 1;
    else if (outcome === 'RETRY') result.retried += 1;
    else result.failed += 1;
  }
  return result;
};

/**
 * Arranca el worker en segundo plano. Las vueltas nunca se solapan: si una tarda más que el
 * intervalo, la siguiente espera. Devuelve una función para detenerlo.
 */
export const startEmailWorker = ({ transport = createMailTransport(), config = workerConfig() } = {}) => {
  let running = false;
  let stopped = false;

  const tick = async () => {
    if (running || stopped) return;
    running = true;
    try {
      const result = await processEmailBatch({ transport, config });
      if (result.claimed) logger.info('JOB', 'email-outbox', 'BATCH', result);
    } catch (error) {
      logger.error('JOB', 'email-outbox', 'ERROR', { msg: error.message }, error.stack);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(tick, config.intervalMs);
  timer.unref?.();
  logger.info('JOB', 'email-outbox', 'STARTED', { intervalMs: config.intervalMs, maxAttempts: config.maxAttempts });
  tick();

  return () => {
    stopped = true;
    clearInterval(timer);
    transport.close?.();
  };
};
