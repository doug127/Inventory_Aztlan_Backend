// Prueba clave del Módulo 2: flujo completo de recuperación con un servidor de correo simulado.
// Se levanta un servidor SMTP real dentro de la prueba (paquete smtp-server), el worker le envía
// los correos de email_outbox y del correo recibido se extrae el enlace para restablecer.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { SMTPServer } from 'smtp-server';
import app from '#src/app.js';
import { sequelize } from '#src/config/database.js';
import { EmailOutbox } from '#src/database/models/index.model.js';
import { processEmailBatch } from '#src/modules/email/email.worker.js';
import { createMailTransport } from '#src/modules/email/email.transport.js';
import { startServer } from '../../helpers/http.js';
import { assertTestDatabase, createTestUser, deleteTestUsers, findEmails } from '../../helpers/db.js';

const config = { batchSize: 10, maxAttempts: 3, retryBaseMs: 60_000, leaseMs: 300_000 };
let api;
let smtp;
let smtpPort;
let inbox = [];

/** Decodifica quoted-printable lo suficiente para leer el cuerpo del correo recibido. */
const decode = (raw) =>
  raw.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

const startSmtp = () =>
  new Promise((resolve) => {
    smtp = new SMTPServer({
      authOptional: true,
      disabledCommands: ['STARTTLS'],
      logger: false,
      onData(stream, session, callback) {
        let raw = '';
        stream.on('data', (chunk) => { raw += chunk; });
        stream.on('end', () => {
          inbox.push({ to: session.envelope.rcptTo.map((r) => r.address), raw: decode(raw) });
          callback();
        });
      },
    });
    smtp.listen(0, '127.0.0.1', () => {
      smtpPort = smtp.server.address().port;
      resolve();
    });
  });

const transport = () => createMailTransport({ SMTP_HOST: '127.0.0.1', SMTP_PORT: String(smtpPort) });

beforeAll(async () => {
  assertTestDatabase();
  await deleteTestUsers();
  await startSmtp();
  api = await startServer(app);
});

beforeEach(async () => {
  inbox = [];
  // Base de pruebas: la cola empieza vacía en cada caso para que el worker solo vea lo de la prueba.
  await EmailOutbox.destroy({ where: {} });
});

afterAll(async () => {
  await api?.close();
  await new Promise((resolve) => smtp.close(resolve));
  await deleteTestUsers();
  await sequelize.close();
});

describe('worker de correos con un servidor SMTP simulado', () => {
  it('flujo completo: olvidé mi contraseña → correo recibido → enlace → contraseña restablecida', async () => {
    const user = await createTestUser({ name: 'smtp.flujo' });
    const email = `${user.username}@aztlan.test`;
    expect((await api.post('/api/auth/forgot-password', { body: { email } })).status).toBe(202);

    const t = transport();
    const result = await processEmailBatch({ transport: t, config });
    t.close();

    expect(result).toMatchObject({ claimed: 1, sent: 1 });
    expect(inbox).toHaveLength(1);
    expect(inbox[0].to).toEqual([email]);
    expect(inbox[0].raw).toMatch(/^Subject: /m);
    expect(inbox[0].raw).toMatch(/^Content-Type: text\/html/m); // lleva versión HTML además del texto

    const token = inbox[0].raw.match(/reset-password\?token=([A-Za-z0-9_-]{43})/)?.[1];
    expect(token).toBeTruthy();

    const reset = await api.post('/api/auth/reset-password', { body: { token, newPassword: 'Desde-El-Correo-2026' } });
    expect(reset.status).toBe(204);
    const login = await api.post('/api/auth/login', { body: { username: user.username, password: 'Desde-El-Correo-2026' } });
    expect(login.status).toBe(200);

    const [row] = await findEmails({ userId: user.id, template: 'PASSWORD_RESET' });
    expect(row).toMatchObject({ status: 'SENT', attempts: 1, lastError: null });
    expect(row.sentAt).toBeInstanceOf(Date);
    expect(row.providerMessageId).toBeTruthy();
  });

  it('envía también los avisos (bloqueo y contraseña cambiada) con los datos del usuario', async () => {
    const user = await createTestUser({ name: 'smtp.avisos' });
    for (let i = 0; i < 5; i += 1) {
      await api.post('/api/auth/login', { body: { username: user.username, password: 'Incorrecta-1' } });
    }
    const t = transport();
    await processEmailBatch({ transport: t, config });
    t.close();

    expect(inbox).toHaveLength(1);
    expect(inbox[0].raw).toContain(user.username);
    expect(inbox[0].raw).toMatch(/se bloque/);
  });

  it('si el servidor de correo no responde, el correo sigue en la cola y se reprograma', async () => {
    const user = await createTestUser({ name: 'smtp.caido' });
    await api.post('/api/auth/forgot-password', { body: { email: `${user.username}@aztlan.test` } });

    const down = createMailTransport({ SMTP_HOST: '127.0.0.1', SMTP_PORT: '1' }); // nadie escucha
    const before = Date.now();
    const result = await processEmailBatch({ transport: down, config });
    down.close();

    expect(result.retried).toBe(1);
    const [row] = await findEmails({ userId: user.id });
    expect(row.status).toBe('PENDING');
    expect(row.attempts).toBe(1);
    expect(row.lastError).toBeTruthy();
    expect(row.scheduledAt.getTime()).toBeGreaterThanOrEqual(before + 59_000);

    // No se vuelve a tomar antes de su hora...
    const t = transport();
    expect((await processEmailBatch({ transport: t, config })).claimed).toBe(0);
    // ...y cuando llega, se envía con el servidor ya disponible.
    const later = new Date(Date.now() + 2 * 60_000);
    expect(await processEmailBatch({ transport: t, config, now: later })).toMatchObject({ claimed: 1, sent: 1 });
    t.close();
    expect(inbox).toHaveLength(1);
  });

  it('al agotar los intentos queda FAILED con el último error', async () => {
    const user = await createTestUser({ name: 'smtp.agotado' });
    await api.post('/api/auth/forgot-password', { body: { email: `${user.username}@aztlan.test` } });

    const down = createMailTransport({ SMTP_HOST: '127.0.0.1', SMTP_PORT: '1' });
    let now = new Date();
    for (let i = 0; i < config.maxAttempts; i += 1) {
      await processEmailBatch({ transport: down, config, now });
      now = new Date(now.getTime() + 60 * 60_000);
    }
    down.close();

    const [row] = await findEmails({ userId: user.id });
    expect(row).toMatchObject({ status: 'FAILED', attempts: config.maxAttempts });
    expect(row.lastError).toBeTruthy();
  });

  it('dos workers a la vez no envían el mismo correo dos veces', async () => {
    for (const name of ['smtp.c1', 'smtp.c2', 'smtp.c3']) {
      const user = await createTestUser({ name });
      await api.post('/api/auth/forgot-password', { body: { email: `${user.username}@aztlan.test` } });
    }
    const [t1, t2] = [transport(), transport()];
    const [a, b] = await Promise.all([
      processEmailBatch({ transport: t1, config }),
      processEmailBatch({ transport: t2, config }),
    ]);
    t1.close();
    t2.close();

    expect(a.sent + b.sent).toBe(3);
    expect(inbox).toHaveLength(3);
    expect(new Set(inbox.map((m) => m.to[0])).size).toBe(3);
  });

  it('un correo PASSWORD_RESET cuyo token fue reemplazado no se envía', async () => {
    const user = await createTestUser({ name: 'smtp.reemplazado' });
    const email = `${user.username}@aztlan.test`;
    await api.post('/api/auth/forgot-password', { body: { email } });
    await api.post('/api/auth/forgot-password', { body: { email } }); // invalida el primero

    const t = transport();
    const result = await processEmailBatch({ transport: t, config });
    t.close();

    expect(result).toMatchObject({ claimed: 2, sent: 1, failed: 1 });
    expect(inbox).toHaveLength(1);
    const rows = await findEmails({ userId: user.id });
    expect(rows.map((r) => r.status)).toEqual(['FAILED', 'SENT']);
  });
});
