// Integración del flujo de recuperación de contraseña (HU-105) con la app real sobre inventory_test.
// El envío de correos llega con HU-106: aquí se hace lo mismo que hará el worker, llamando a
// prepareResetTokenForDelivery para obtener el token que iría en el enlace del correo.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import app from '#src/app.js';
import { sequelize } from '#src/config/database.js';
import { PasswordResetToken, RefreshToken, User } from '#src/database/models/index.model.js';
import { prepareResetTokenForDelivery } from '#src/modules/auth/auth.service.js';
import { devResetLink } from '#src/database/scripts/dev-reset-link.js';
import { startServer } from '../../helpers/http.js';
import { assertTestDatabase, createTestUser, deleteTestUsers, findEmails, lastAuthEvent } from '../../helpers/db.js';

const NEW = 'Recuperada-2026';
let api;

const emailOf = (user) => `${user.username}@aztlan.test`;
const forgot = (email) => api.post('/api/auth/forgot-password', { body: { email } });
const reset = (token, newPassword = NEW) => api.post('/api/auth/reset-password', { body: { token, newPassword } });
const validateToken = (token) => api.get(`/api/auth/reset-password/validate?token=${encodeURIComponent(token)}`);
const login = (user, password) => api.post('/api/auth/login', { body: { username: user.username, password } });

/** Solicita la recuperación y obtiene el token como lo haría el worker al enviar el correo. */
const requestToken = async (user) => {
  expect((await forgot(emailOf(user))).status).toBe(202);
  const [email] = (await findEmails({ userId: user.id, template: 'PASSWORD_RESET' })).slice(-1);
  return (await prepareResetTokenForDelivery(email.passwordResetTokenId)).token;
};

beforeAll(async () => {
  assertTestDatabase();
  await deleteTestUsers();
  api = await startServer(app);
});

afterAll(async () => {
  await api?.close();
  await deleteTestUsers();
  await sequelize.close();
});

describe('POST /api/auth/forgot-password', () => {
  it('responde exactamente lo mismo exista o no el correo', async () => {
    const user = await createTestUser({ name: 'olvido' });
    const existing = await forgot(emailOf(user));
    const unknown = await forgot('test.nadie@aztlan.test');

    expect(existing.status).toBe(202);
    expect(unknown.status).toBe(202);
    expect(existing.body).toEqual(unknown.body);
    expect(existing.body.data.message).toMatch(/Si el correo pertenece a una cuenta activa/);
  });

  it('a un usuario activo le crea un token (solo hash) y le encola PASSWORD_RESET', async () => {
    const user = await createTestUser({ name: 'olvido.activo' });
    await forgot(`  ${emailOf(user).toUpperCase()} `); // se normaliza

    const [email] = await findEmails({ userId: user.id, template: 'PASSWORD_RESET' });
    expect(email).toMatchObject({ toEmail: emailOf(user), status: 'PENDING', subject: 'Recuperación de contraseña' });
    const token = await PasswordResetToken.findByPk(email.passwordResetTokenId);
    expect(token.userId).toBe(user.id);
    expect(token.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(await lastAuthEvent({ userId: user.id })).toMatchObject({ eventType: 'PASSWORD_RESET_REQUESTED' });
  });

  it('un usuario inactivo no recibe correo', async () => {
    const user = await createTestUser({ name: 'olvido.inactivo', isActive: false });
    expect((await forgot(emailOf(user))).status).toBe(202);
    expect(await findEmails({ userId: user.id })).toHaveLength(0);
  });

  it('una solicitud nueva invalida la anterior: solo un token vigente', async () => {
    const user = await createTestUser({ name: 'olvido.doble' });
    const first = await requestToken(user);
    const second = await requestToken(user);

    expect((await validateToken(first)).status).toBe(400);
    expect((await validateToken(second)).status).toBe(200);
    expect(await PasswordResetToken.count({ where: { userId: user.id, usedAt: null, invalidatedAt: null } })).toBe(1);
  });

  it('máximo 3 solicitudes por hora por usuario; la cuarta responde igual pero no crea nada', async () => {
    const user = await createTestUser({ name: 'olvido.limite' });
    for (let i = 0; i < 4; i += 1) expect((await forgot(emailOf(user))).status).toBe(202);
    expect(await PasswordResetToken.count({ where: { userId: user.id } })).toBe(3);
    expect(await findEmails({ userId: user.id, template: 'PASSWORD_RESET' })).toHaveLength(3);
  });

  it('solicitudes simultáneas del mismo usuario no rompen el único token vigente', async () => {
    const user = await createTestUser({ name: 'olvido.simultaneo' });
    const results = await Promise.all([forgot(emailOf(user)), forgot(emailOf(user)), forgot(emailOf(user))]);
    expect(results.map((r) => r.status)).toEqual([202, 202, 202]);
    expect(await PasswordResetToken.count({ where: { userId: user.id, usedAt: null, invalidatedAt: null } })).toBe(1);
  });

  it('400 VALIDATION_ERROR con un correo mal formado', async () => {
    const { status, body } = await forgot('no-es-un-correo');
    expect(status).toBe(400);
    expect(body.error.details[0]).toMatchObject({ path: 'email' });
  });
});

describe('restablecimiento con el token del correo', () => {
  it('flujo completo: validar, restablecer, entrar con la nueva y no con la vieja', async () => {
    const user = await createTestUser({ name: 'recupera', mustChangePassword: true });
    const session = await login(user, user.password);
    const cookie = `refreshToken=${session.readCookie('refreshToken').value}`;

    const token = await requestToken(user);
    const valid = await validateToken(token);
    expect(valid.status).toBe(200);
    expect(valid.body.data).toMatchObject({ valid: true });

    const res = await reset(token);
    expect(res.status).toBe(204);

    expect((await login(user, user.password)).status).toBe(401);
    const fresh = await login(user, NEW);
    expect(fresh.status).toBe(200);
    expect(fresh.body.data.user.mustChangePassword).toBe(false);

    // Sesiones anteriores revocadas, correo PASSWORD_CHANGED encolado y evento registrado.
    expect((await api.post('/api/auth/refresh', { cookie })).status).toBe(401);
    expect(await findEmails({ userId: user.id, template: 'PASSWORD_CHANGED' })).toHaveLength(1);
    expect(await lastAuthEvent({ userId: user.id, eventType: 'PASSWORD_RESET_COMPLETED' })).not.toBeNull();
  });

  it('el token es de uso único', async () => {
    const user = await createTestUser({ name: 'recupera.unico' });
    const token = await requestToken(user);
    expect((await reset(token)).status).toBe(204);

    const again = await reset(token, 'Otra-Clave-2026');
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe('AUTH_RESET_TOKEN_INVALID');
    expect((await validateToken(token)).body.error.code).toBe('AUTH_RESET_TOKEN_INVALID');
  });

  it('un token vencido responde AUTH_RESET_TOKEN_INVALID', async () => {
    const user = await createTestUser({ name: 'recupera.vencido' });
    const token = await requestToken(user);
    // Un token vencido de verdad se creó hace más de 30 min (CHECK expires_at > created_at).
    await sequelize.query(
      `UPDATE password_reset_tokens
          SET created_at = now() - interval '1 hour', expires_at = now() - interval '1 second'
        WHERE user_id = :userId`,
      { replacements: { userId: user.id } }
    );

    const { status, body } = await reset(token);
    expect(status).toBe(400);
    expect(body.error.code).toBe('AUTH_RESET_TOKEN_INVALID');
  });

  it('un token inventado responde AUTH_RESET_TOKEN_INVALID', async () => {
    expect((await reset('x'.repeat(43))).body.error.code).toBe('AUTH_RESET_TOKEN_INVALID');
    expect((await validateToken('x'.repeat(43))).status).toBe(400);
  });

  it('una contraseña débil responde AUTH_WEAK_PASSWORD y el token sigue sirviendo', async () => {
    const user = await createTestUser({ name: 'recupera.debil' });
    const token = await requestToken(user);

    const weak = await reset(token, 'debil');
    expect(weak.status).toBe(400);
    expect(weak.body.error.code).toBe('AUTH_WEAK_PASSWORD');
    expect((await reset(token)).status).toBe(204);
  });

  it('restablecer la contraseña desbloquea una cuenta bloqueada por intentos fallidos', async () => {
    const user = await createTestUser({ name: 'recupera.bloqueada' });
    for (let i = 0; i < 5; i += 1) await login(user, 'Incorrecta-1');
    expect((await User.findByPk(user.id)).lockedUntil).toBeInstanceOf(Date);

    const token = await requestToken(user);
    expect((await reset(token)).status).toBe(204);
    expect((await login(user, NEW)).status).toBe(200);
  });

  it('el enlace de un usuario desactivado después de pedirlo ya no sirve', async () => {
    const user = await createTestUser({ name: 'recupera.desactivado' });
    const token = await requestToken(user);
    await User.update({ isActive: false }, { where: { id: user.id } });
    expect((await reset(token)).body.error.code).toBe('AUTH_RESET_TOKEN_INVALID');
  });

  it('400 VALIDATION_ERROR si falta el token o la contraseña', async () => {
    const missing = await api.post('/api/auth/reset-password', { body: { token: 'x'.repeat(43) } });
    expect(missing.status).toBe(400);
    expect(missing.body.error.details[0]).toMatchObject({ path: 'newPassword' });
    expect((await api.get('/api/auth/reset-password/validate')).status).toBe(400);
  });

  it('reintentar el envío genera un token nuevo y anula el enlace anterior', async () => {
    const user = await createTestUser({ name: 'recupera.reenvio' });
    const first = await requestToken(user);
    const [email] = (await findEmails({ userId: user.id, template: 'PASSWORD_RESET' })).slice(-1);
    const resent = await prepareResetTokenForDelivery(email.passwordResetTokenId);

    expect(resent.token).not.toBe(first);
    expect((await validateToken(first)).status).toBe(400);
    expect((await validateToken(resent.token)).status).toBe(200);
  });
});

describe('pnpm dev:reset-link', () => {
  it('entrega el enlace del último correo PASSWORD_RESET pendiente', async () => {
    const user = await createTestUser({ name: 'enlace' });
    await forgot(emailOf(user));
    const { token, link } = await devResetLink(emailOf(user));
    expect(link).toContain(`/reset-password?token=${encodeURIComponent(token)}`);
    expect((await validateToken(token)).status).toBe(200);
  });

  it('explica qué hacer si no hay una solicitud pendiente', async () => {
    await expect(devResetLink('test.sin-solicitud@aztlan.test')).rejects.toThrow(/forgot-password/);
  });

  it('no se puede usar en producción', async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      await expect(devResetLink('x@aztlan.test')).rejects.toThrow(/solo para desarrollo/);
    } finally {
      process.env.NODE_ENV = previous;
    }
  });
});

it('ningún token de recuperación en claro queda en la base', async () => {
  const user = await createTestUser({ name: 'sin.claro' });
  const token = await requestToken(user);
  const [rows] = await sequelize.query(
    `SELECT count(*)::int AS n FROM password_reset_tokens WHERE token_hash = :token
     UNION ALL SELECT count(*)::int FROM email_outbox WHERE subject LIKE :like OR last_error LIKE :like`,
    { replacements: { token, like: `%${token}%` } }
  );
  expect(rows.map((r) => r.n)).toEqual([0, 0]);
  expect(await RefreshToken.count({ where: { tokenHash: token } })).toBe(0);
});
