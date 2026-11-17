// Unitaria del worker con el repository simulado y un transporte falso (sin BD ni SMTP).
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('#src/modules/email/email.repository.js', () => ({
  claimDueEmails: vi.fn(),
  markSent: vi.fn(),
  markRetry: vi.fn(),
  markFailed: vi.fn(),
  findRecipient: vi.fn(),
}));
vi.mock('#src/modules/auth/auth.service.js', () => ({
  prepareResetTokenForDelivery: vi.fn(),
  prepareWelcomeForDelivery: vi.fn(),
}));

const repo = await import('#src/modules/email/email.repository.js');
const auth = await import('#src/modules/auth/auth.service.js');
const { processEmailBatch, retryDelayMs } = await import('#src/modules/email/email.worker.js');

const MIN = 60_000;
const config = { batchSize: 10, maxAttempts: 5, retryBaseMs: MIN, leaseMs: 5 * MIN };
const now = new Date('2026-11-12T12:00:00Z');
const recipient = { id: 7, username: 'pedro.gomez', fullName: 'Pedro Gómez', email: 'pedro@aztlan.test' };

const email = (overrides = {}) => ({
  id: '1',
  userId: 7,
  toEmail: 'pedro@aztlan.test',
  template: 'ACCOUNT_LOCKED',
  attempts: 1,
  passwordResetTokenId: null,
  createdAt: now,
  ...overrides,
});

const okTransport = () => ({ sendMail: vi.fn().mockResolvedValue({ messageId: '<abc@mailpit>' }) });
const brokenTransport = () => ({ sendMail: vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:1025')) });

beforeEach(() => {
  vi.clearAllMocks();
  repo.findRecipient.mockResolvedValue(recipient);
});

describe('retryDelayMs', () => {
  it('duplica la espera en cada intento: 1, 2, 4, 8 minutos', () => {
    expect([1, 2, 3, 4].map((a) => retryDelayMs(a, MIN) / MIN)).toEqual([1, 2, 4, 8]);
  });
});

describe('processEmailBatch', () => {
  it('reclama con un plazo de 5 min y marca SENT lo que se envía', async () => {
    repo.claimDueEmails.mockResolvedValue([email()]);
    const transport = okTransport();

    const result = await processEmailBatch({ transport, config, now });

    expect(result).toEqual({ claimed: 1, sent: 1, retried: 0, failed: 0 });
    expect(repo.claimDueEmails).toHaveBeenCalledWith({ limit: 10, now, leaseUntil: new Date(now.getTime() + 5 * MIN) });
    const message = transport.sendMail.mock.calls[0][0];
    expect(message).toMatchObject({ to: 'pedro@aztlan.test', subject: 'Su cuenta fue bloqueada temporalmente' });
    expect(message.text).toContain('Pedro Gómez');
    expect(repo.markSent).toHaveBeenCalledWith('1', { sentAt: expect.any(Date), providerMessageId: '<abc@mailpit>' });
  });

  it('si el servidor de correo falla, reprograma con espera creciente y guarda el motivo', async () => {
    repo.claimDueEmails.mockResolvedValue([email({ attempts: 3 })]);
    const result = await processEmailBatch({ transport: brokenTransport(), config, now });

    expect(result.retried).toBe(1);
    expect(repo.markRetry).toHaveBeenCalledWith('1', {
      scheduledAt: new Date(now.getTime() + 4 * MIN),
      lastError: 'connect ECONNREFUSED 127.0.0.1:1025',
    });
    expect(repo.markSent).not.toHaveBeenCalled();
  });

  it('al agotar los intentos queda FAILED', async () => {
    repo.claimDueEmails.mockResolvedValue([email({ attempts: 5 })]);
    const result = await processEmailBatch({ transport: brokenTransport(), config, now });
    expect(result.failed).toBe(1);
    expect(repo.markFailed).toHaveBeenCalledWith('1', { lastError: expect.stringContaining('ECONNREFUSED') });
    expect(repo.markRetry).not.toHaveBeenCalled();
  });

  it('PASSWORD_RESET: genera el token al enviar y pone el enlace en el correo', async () => {
    repo.claimDueEmails.mockResolvedValue([email({ template: 'PASSWORD_RESET', passwordResetTokenId: '9' })]);
    auth.prepareResetTokenForDelivery.mockResolvedValue({ token: 'TokenRecuperacion_123', expiresAt: now });
    const transport = okTransport();

    await processEmailBatch({ transport, config, now });

    expect(auth.prepareResetTokenForDelivery).toHaveBeenCalledWith('9');
    expect(transport.sendMail.mock.calls[0][0].text).toContain('/reset-password?token=TokenRecuperacion_123');
  });

  it('PASSWORD_RESET con el token ya usado o reemplazado: no se envía y queda FAILED sin reintentos', async () => {
    repo.claimDueEmails.mockResolvedValue([email({ template: 'PASSWORD_RESET', passwordResetTokenId: '9', attempts: 1 })]);
    auth.prepareResetTokenForDelivery.mockResolvedValue(null);
    const transport = okTransport();

    const result = await processEmailBatch({ transport, config, now });

    expect(result.failed).toBe(1);
    expect(transport.sendMail).not.toHaveBeenCalled();
    expect(repo.markFailed).toHaveBeenCalledWith('1', { lastError: expect.stringMatching(/Cancelado/) });
  });

  it('WELCOME: genera la contraseña temporal al enviar y la pone en el correo', async () => {
    repo.claimDueEmails.mockResolvedValue([email({ template: 'WELCOME' })]);
    auth.prepareWelcomeForDelivery.mockResolvedValue({ temporaryPassword: 'Temp4567Abcd' });
    const transport = okTransport();

    await processEmailBatch({ transport, config, now });

    expect(auth.prepareWelcomeForDelivery).toHaveBeenCalledWith(7);
    const message = transport.sendMail.mock.calls[0][0];
    expect(message.subject).toBe('Bienvenido a Inventario Aztlan');
    expect(message.text).toContain('Contraseña temporal: Temp4567Abcd');
    expect(message.text).toContain('Usuario: pedro.gomez');
    expect(repo.markSent).toHaveBeenCalled();
  });

  it('WELCOME de un usuario que ya ingresó o fue desactivado: no se envía y queda FAILED', async () => {
    repo.claimDueEmails.mockResolvedValue([email({ template: 'WELCOME' })]);
    auth.prepareWelcomeForDelivery.mockResolvedValue(null);
    const transport = okTransport();

    expect((await processEmailBatch({ transport, config, now })).failed).toBe(1);
    expect(transport.sendMail).not.toHaveBeenCalled();
    expect(repo.markFailed).toHaveBeenCalledWith('1', { lastError: expect.stringMatching(/Cancelado/) });
  });

  it('si el destinatario ya no existe, no se envía', async () => {
    repo.claimDueEmails.mockResolvedValue([email()]);
    repo.findRecipient.mockResolvedValue(null);
    const transport = okTransport();
    await processEmailBatch({ transport, config, now });
    expect(transport.sendMail).not.toHaveBeenCalled();
    expect(repo.markFailed).toHaveBeenCalled();
  });

  it('un correo que falla no detiene a los demás de la vuelta', async () => {
    repo.claimDueEmails.mockResolvedValue([email({ id: '1' }), email({ id: '2' })]);
    const transport = { sendMail: vi.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce({ messageId: 'x' }) };
    expect(await processEmailBatch({ transport, config, now })).toEqual({ claimed: 2, sent: 1, retried: 1, failed: 0 });
  });

  it('sin correos pendientes no hace nada', async () => {
    repo.claimDueEmails.mockResolvedValue([]);
    const transport = okTransport();
    expect(await processEmailBatch({ transport, config, now })).toEqual({ claimed: 0, sent: 0, retried: 0, failed: 0 });
    expect(transport.sendMail).not.toHaveBeenCalled();
  });
});
