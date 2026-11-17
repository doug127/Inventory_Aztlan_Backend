import { sequelize } from '#src/config/database.js';
import { EmailOutbox, User } from '#src/database/models/index.model.js';
import { EMAIL_STATUS } from '#src/shared/constants/email.js';

const plain = (row) => (row ? row.get({ plain: true }) : null);

export const createEmail = async (data, { transaction } = {}) => plain(await EmailOutbox.create(data, { transaction }));

/**
 * Reclama hasta `limit` correos pendientes cuya hora ya llegó, en una sola sentencia:
 * - FOR UPDATE SKIP LOCKED: dos workers simultáneos nunca toman el mismo correo.
 * - Suma el intento y mueve scheduled_at a `leaseUntil`: si el proceso cae a mitad del envío,
 *   el correo vuelve a estar disponible cuando vence ese plazo, sin quedar atascado.
 */
export const claimDueEmails = async ({ limit, now, leaseUntil }) => {
  const [rows] = await sequelize.query(
    `UPDATE email_outbox
        SET attempts = attempts + 1, scheduled_at = :leaseUntil
      WHERE id IN (
        SELECT id FROM email_outbox
         WHERE status = :pending AND scheduled_at <= :now
         ORDER BY scheduled_at, id
         LIMIT :limit
         FOR UPDATE SKIP LOCKED)
      RETURNING id, user_id, to_email, template, subject, attempts, password_reset_token_id, created_at`,
    { replacements: { limit, now, leaseUntil, pending: EMAIL_STATUS.PENDING } }
  );
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    toEmail: r.to_email,
    template: r.template,
    subject: r.subject,
    attempts: r.attempts,
    passwordResetTokenId: r.password_reset_token_id,
    createdAt: r.created_at,
  }));
};

export const markSent = async (id, { sentAt, providerMessageId }) => {
  await EmailOutbox.update(
    { status: EMAIL_STATUS.SENT, sentAt, providerMessageId: providerMessageId ?? null, lastError: null },
    { where: { id } }
  );
};

export const markRetry = async (id, { scheduledAt, lastError }) => {
  await EmailOutbox.update({ status: EMAIL_STATUS.PENDING, scheduledAt, lastError }, { where: { id } });
};

export const markFailed = async (id, { lastError }) => {
  await EmailOutbox.update({ status: EMAIL_STATUS.FAILED, lastError }, { where: { id } });
};

export const findRecipient = async (userId) =>
  plain(await User.findByPk(userId, { attributes: ['id', 'username', 'fullName', 'email', 'isActive'] }));
