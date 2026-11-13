// Integración del endpoint con la app real (app.js) sobre la base de pruebas inventory_test.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import jwt from 'jsonwebtoken';
import app from '#src/app.js';
import { sequelize } from '#src/config/database.js';
import { RefreshToken, User } from '#src/database/models/index.model.js';
import { hashToken } from '#src/modules/auth/token.service.js';
import { auth } from '#src/shared/middlewares/auth.middleware.js';
import { authorizeRole } from '#src/shared/middlewares/authorize.middleware.js';
import { errorHandler } from '#src/shared/middlewares/errorHandler.middleware.js';
import { requestId } from '#src/shared/middlewares/requestId.middleware.js';
import { ROLE_CODES } from '#src/shared/constants/roles.js';
import { startServer } from '../../helpers/http.js';
import { assertTestDatabase, createTestUser, deleteTestUsers, findEmails, lastAuthEvent } from '../../helpers/db.js';

const GENERIC_MESSAGE = 'Usuario o contraseña incorrectos';

let api;
let almacenista;
let admin;
let inactivo;

const loginAs = async (user, password = user.password) => {
  const res = await api.post('/api/auth/login', { body: { username: user.username, password } });
  return res.body?.data?.accessToken;
};

const REFRESH = 'refreshToken';

/** Inicia sesión y devuelve el access token y la cookie del refresh token lista para enviar. */
const loginWithCookie = async (user) => {
  const res = await api.post('/api/auth/login', { body: { username: user.username, password: user.password } });
  const cookie = res.readCookie(REFRESH);
  return { accessToken: res.body.data.accessToken, raw: cookie.value, cookie: `${REFRESH}=${cookie.value}` };
};

const findStoredToken = async (raw) =>
  (await RefreshToken.findOne({ where: { tokenHash: hashToken(raw) } }))?.get({ plain: true }) ?? null;

beforeAll(async () => {
  assertTestDatabase();
  await deleteTestUsers();
  almacenista = await createTestUser({ name: 'almacenista', roleCode: 'ALMACENISTA' });
  admin = await createTestUser({ name: 'admin', roleCode: 'ADMIN' });
  inactivo = await createTestUser({ name: 'inactivo', isActive: false });
  api = await startServer(app);
});

afterAll(async () => {
  await api?.close();
  await deleteTestUsers();
  await sequelize.close();
});

describe('POST /api/auth/login', () => {
  it('200 con access token, tipo Bearer, 15 min y el usuario sin datos sensibles', async () => {
    const { status, body } = await api.post('/api/auth/login', {
      body: { username: almacenista.username, password: almacenista.password },
    });

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({
      tokenType: 'Bearer',
      expiresIn: 900,
      user: {
        id: almacenista.id,
        username: almacenista.username,
        role: { code: 'ALMACENISTA', name: 'Almacenista', hierarchy: 2 },
        mustChangePassword: false,
      },
    });
    expect(typeof body.data.accessToken).toBe('string');
    expect(JSON.stringify(body)).not.toMatch(/passwordHash|password_hash|\$2[aby]\$/);
  });

  it('registra LOGIN_SUCCESS y guarda last_login_at', async () => {
    await loginAs(almacenista);
    const event = await lastAuthEvent({ userId: almacenista.id });
    expect(event).toMatchObject({ eventType: 'LOGIN_SUCCESS', usernameAttempted: almacenista.username });
    expect(event.ipAddress).toBeTruthy();
    const user = await User.findByPk(almacenista.id);
    expect(user.lastLoginAt).toBeInstanceOf(Date);
  });

  it('el nombre de usuario no distingue mayúsculas ni espacios', async () => {
    const { status } = await api.post('/api/auth/login', {
      body: { username: `  ${almacenista.username.toUpperCase()} `, password: almacenista.password },
    });
    expect(status).toBe(200);
  });

  it('contraseña incorrecta: 401 genérico y LOGIN_FAILED', async () => {
    const { status, body } = await api.post('/api/auth/login', { body: { username: almacenista.username, password: 'Incorrecta-1' } });
    expect(status).toBe(401);
    expect(body.error).toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS', message: GENERIC_MESSAGE });
    expect(await lastAuthEvent({ userId: almacenista.id })).toMatchObject({ eventType: 'LOGIN_FAILED' });
  });

  it('usuario inexistente: la misma respuesta que una contraseña incorrecta', async () => {
    const wrongPassword = await api.post('/api/auth/login', { body: { username: almacenista.username, password: 'Incorrecta-1' } });
    const unknownUser = await api.post('/api/auth/login', { body: { username: 'test.nadie', password: 'Incorrecta-1' } });

    expect(unknownUser.status).toBe(wrongPassword.status);
    expect({ ...unknownUser.body.error, requestId: null }).toEqual({ ...wrongPassword.body.error, requestId: null });
    expect(await lastAuthEvent({ usernameAttempted: 'test.nadie' })).toMatchObject({ eventType: 'LOGIN_FAILED', userId: null });
  });

  it('cuenta desactivada: 403 AUTH_ACCOUNT_INACTIVE solo con la contraseña correcta', async () => {
    const ok = await api.post('/api/auth/login', { body: { username: inactivo.username, password: inactivo.password } });
    expect(ok.status).toBe(403);
    expect(ok.body.error.code).toBe('AUTH_ACCOUNT_INACTIVE');

    const wrong = await api.post('/api/auth/login', { body: { username: inactivo.username, password: 'Incorrecta-1' } });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
  });

  it('acepta contraseñas que no cumplen la política actual (se valida al crearlas, no al entrar)', async () => {
    const simple = await createTestUser({ name: 'simple', password: 'abc' });
    expect(await loginAs(simple)).toBeTruthy();
  });

  it('400 VALIDATION_ERROR si faltan campos o sobran', async () => {
    const missing = await api.post('/api/auth/login', { body: { username: almacenista.username } });
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe('VALIDATION_ERROR');
    expect(missing.body.error.details).toEqual([expect.objectContaining({ location: 'body', path: 'password' })]);

    const extra = await api.post('/api/auth/login', { body: { username: 'a', password: 'b', role: 'SUPERADMIN' } });
    expect(extra.status).toBe(400);
  });
});

describe('bloqueo por intentos fallidos (HU-103)', () => {
  const failLogin = (user) => api.post('/api/auth/login', { body: { username: user.username, password: 'Incorrecta-1' } });

  it('al quinto fallo: 423 AUTH_ACCOUNT_LOCKED por 15 min, ACCOUNT_LOCKED y correo encolado', async () => {
    const victim = await createTestUser({ name: 'bloqueo' });
    for (let i = 1; i <= 4; i += 1) {
      const res = await failLogin(victim);
      expect(res.status, `intento ${i}`).toBe(401);
    }
    expect((await User.findByPk(victim.id)).failedLoginAttempts).toBe(4);

    const fifth = await failLogin(victim);
    expect(fifth.status).toBe(423);
    expect(fifth.body.error.code).toBe('AUTH_ACCOUNT_LOCKED');
    expect(fifth.body.error.details.retryAfterSeconds).toBe(900);
    expect(fifth.headers.get('retry-after')).toBe('900');

    const user = await User.findByPk(victim.id);
    expect(user.failedLoginAttempts).toBe(5);
    const minutes = (user.lockedUntil.getTime() - Date.now()) / 60000;
    expect(minutes).toBeGreaterThan(14.9);
    expect(minutes).toBeLessThanOrEqual(15);

    expect(await lastAuthEvent({ userId: victim.id })).toMatchObject({ eventType: 'ACCOUNT_LOCKED' });
    const emails = await findEmails({ userId: victim.id });
    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({
      toEmail: `${victim.username}@aztlan.test`,
      template: 'ACCOUNT_LOCKED',
      status: 'PENDING',
      subject: 'Su cuenta fue bloqueada temporalmente',
      attempts: 0,
    });
  });

  it('mientras está bloqueada, la contraseña correcta también recibe 423 y no se encolan más correos', async () => {
    const victim = await createTestUser({ name: 'bloqueada' });
    for (let i = 0; i < 5; i += 1) await failLogin(victim);

    const res = await api.post('/api/auth/login', { body: { username: victim.username, password: victim.password } });
    expect(res.status).toBe(423);
    expect(res.readCookie(REFRESH)).toBeNull();
    expect(await findEmails({ userId: victim.id })).toHaveLength(1);
    expect((await User.findByPk(victim.id)).failedLoginAttempts).toBe(5);
  });

  it('cuando el bloqueo vence puede entrar y el contador vuelve a 0', async () => {
    const victim = await createTestUser({ name: 'vencido' });
    for (let i = 0; i < 5; i += 1) await failLogin(victim);
    await User.update({ lockedUntil: new Date(Date.now() - 1000) }, { where: { id: victim.id } });

    expect(await loginAs(victim)).toBeTruthy();
    const user = await User.findByPk(victim.id);
    expect(user.failedLoginAttempts).toBe(0);
    expect(user.lockedUntil).toBeNull();
  });

  it('un login exitoso reinicia el contador: 4 fallos + éxito + 4 fallos no bloquean', async () => {
    const victim = await createTestUser({ name: 'reinicio' });
    for (let i = 0; i < 4; i += 1) await failLogin(victim);
    expect(await loginAs(victim)).toBeTruthy();
    for (let i = 0; i < 4; i += 1) expect((await failLogin(victim)).status).toBe(401);
    expect((await User.findByPk(victim.id)).lockedUntil).toBeNull();
  });

  it('fallos simultáneos se cuentan sin perder ninguno', async () => {
    const victim = await createTestUser({ name: 'simultaneo' });
    const results = await Promise.all(Array.from({ length: 7 }, () => failLogin(victim)));

    const user = await User.findByPk(victim.id);
    expect(user.lockedUntil).toBeInstanceOf(Date);
    expect(user.failedLoginAttempts).toBe(5);
    expect(results.filter((r) => r.status === 401)).toHaveLength(4);
    expect(results.filter((r) => r.status === 423)).toHaveLength(3);
    expect(await findEmails({ userId: victim.id })).toHaveLength(1);
  });

  it('un usuario inexistente nunca responde 423', async () => {
    for (let i = 0; i < 6; i += 1) {
      expect((await api.post('/api/auth/login', { body: { username: 'test.fantasma', password: 'x' } })).status).toBe(401);
    }
  });
});

describe('GET /api/auth/me', () => {
  it('200 con el usuario de la sesión', async () => {
    const token = await loginAs(almacenista);
    const { status, body } = await api.get('/api/auth/me', { token });
    expect(status).toBe(200);
    expect(body.data).toMatchObject({ id: almacenista.id, username: almacenista.username, role: { code: 'ALMACENISTA' } });
  });

  it('401 AUTH_TOKEN_MISSING sin header Authorization', async () => {
    const { status, body } = await api.get('/api/auth/me');
    expect(status).toBe(401);
    expect(body.error.code).toBe('AUTH_TOKEN_MISSING');
  });

  it('401 AUTH_TOKEN_INVALID con un token mal firmado', async () => {
    const forged = jwt.sign({ sub: String(admin.id), role_code: 'SUPERADMIN', hierarchy: 0 }, 'otro-secreto');
    const { status, body } = await api.get('/api/auth/me', { token: forged });
    expect(status).toBe(401);
    expect(body.error.code).toBe('AUTH_TOKEN_INVALID');
  });

  it('401 AUTH_TOKEN_EXPIRED con un token vencido', async () => {
    const expired = jwt.sign({ sub: String(almacenista.id), iat: Math.floor(Date.now() / 1000) - 1000 }, process.env.JWT_SECRET, { expiresIn: 900 });
    const { status, body } = await api.get('/api/auth/me', { token: expired });
    expect(status).toBe(401);
    expect(body.error.code).toBe('AUTH_TOKEN_EXPIRED');
  });

  it('rechaza un token emitido antes del último cambio de contraseña', async () => {
    const token = await loginAs(almacenista);
    await User.update({ passwordChangedAt: new Date(Date.now() + 2000) }, { where: { id: almacenista.id } });
    try {
      const { status, body } = await api.get('/api/auth/me', { token });
      expect(status).toBe(401);
      expect(body.error.code).toBe('AUTH_TOKEN_INVALID');
    } finally {
      await User.update({ passwordChangedAt: new Date(Date.now() - 60_000) }, { where: { id: almacenista.id } });
    }
  });

  it('un usuario desactivado pierde el acceso en la siguiente petición', async () => {
    const temporal = await createTestUser({ name: 'temporal' });
    const token = await loginAs(temporal);
    expect((await api.get('/api/auth/me', { token })).status).toBe(200);

    await User.update({ isActive: false }, { where: { id: temporal.id } });
    const { status, body } = await api.get('/api/auth/me', { token });
    expect(status).toBe(403);
    expect(body.error.code).toBe('AUTH_ACCOUNT_INACTIVE');
  });
});

describe('refresh token en el login (HU-102)', () => {
  it('se entrega solo en una cookie httpOnly, sameSite=strict, path /api/auth, de 7 días', async () => {
    const res = await api.post('/api/auth/login', { body: { username: almacenista.username, password: almacenista.password } });
    const cookie = res.readCookie(REFRESH);

    expect(cookie).not.toBeNull();
    expect(cookie.attributes).toMatchObject({ httponly: true, samesite: 'Strict', path: '/api/auth' });
    const days = (new Date(cookie.attributes.expires).getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(6.99);
    expect(days).toBeLessThanOrEqual(7);
    expect(JSON.stringify(res.body)).not.toContain(cookie.value);
  });

  it('en la BD se guarda solo el SHA-256, nunca el token en claro', async () => {
    const { raw } = await loginWithCookie(almacenista);
    const stored = await findStoredToken(raw);
    expect(stored).toMatchObject({ userId: almacenista.id, revokedAt: null, replacedByTokenId: null });
    expect(stored.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(await RefreshToken.count({ where: { tokenHash: raw } })).toBe(0);
  });
});

describe('POST /api/auth/refresh (HU-102)', () => {
  it('200: nuevo access token y cookie rotada; el token anterior queda revocado y enlazado', async () => {
    const first = await loginWithCookie(almacenista);
    const res = await api.post('/api/auth/refresh', { cookie: first.cookie });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ tokenType: 'Bearer', expiresIn: 900, user: { id: almacenista.id } });
    const rotated = res.readCookie(REFRESH);
    expect(rotated.value).not.toBe(first.raw);

    const oldRow = await findStoredToken(first.raw);
    const newRow = await findStoredToken(rotated.value);
    expect(oldRow.revokedAt).toBeInstanceOf(Date);
    expect(oldRow.replacedByTokenId).toBe(newRow.id);
    expect(newRow.revokedAt).toBeNull();
    expect(await lastAuthEvent({ userId: almacenista.id })).toMatchObject({ eventType: 'TOKEN_REFRESHED' });

    // El access token renovado sirve para el API.
    expect((await api.get('/api/auth/me', { token: res.body.data.accessToken })).status).toBe(200);
  });

  it('la sesión puede renovarse varias veces seguidas con la cookie más reciente', async () => {
    let { cookie } = await loginWithCookie(almacenista);
    for (let i = 0; i < 3; i += 1) {
      const res = await api.post('/api/auth/refresh', { cookie });
      expect(res.status).toBe(200);
      cookie = `${REFRESH}=${res.readCookie(REFRESH).value}`;
    }
  });

  it('reusar un token ya rotado revoca todas las sesiones del usuario', async () => {
    const victim = await createTestUser({ name: 'reuso' });
    const stolen = await loginWithCookie(victim);
    const otherDevice = await loginWithCookie(victim);
    const rotated = await api.post('/api/auth/refresh', { cookie: stolen.cookie });
    const current = `${REFRESH}=${rotated.readCookie(REFRESH).value}`;

    const reuse = await api.post('/api/auth/refresh', { cookie: stolen.cookie });
    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe('AUTH_TOKEN_INVALID');

    // Ni el token rotado legítimo ni la sesión del otro dispositivo sobreviven.
    expect((await api.post('/api/auth/refresh', { cookie: current })).status).toBe(401);
    expect((await api.post('/api/auth/refresh', { cookie: otherDevice.cookie })).status).toBe(401);
    expect(await RefreshToken.count({ where: { userId: victim.id, revokedAt: null } })).toBe(0);
  });

  it('dos renovaciones simultáneas con la misma cookie: solo una rota; la otra cuenta como reuso', async () => {
    const racer = await createTestUser({ name: 'carrera' });
    const { cookie } = await loginWithCookie(racer);

    const results = await Promise.all([
      api.post('/api/auth/refresh', { cookie }),
      api.post('/api/auth/refresh', { cookie }),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
    // El bloqueo FOR UPDATE serializa ambas: la segunda ve el token ya rotado y revoca todo.
    expect(await RefreshToken.count({ where: { userId: racer.id, revokedAt: null } })).toBe(0);
  });

  it('401 AUTH_TOKEN_MISSING sin cookie', async () => {
    const { status, body } = await api.post('/api/auth/refresh');
    expect(status).toBe(401);
    expect(body.error.code).toBe('AUTH_TOKEN_MISSING');
  });

  it('401 AUTH_TOKEN_INVALID con una cookie inventada, y la cookie se borra', async () => {
    const res = await api.post('/api/auth/refresh', { cookie: `${REFRESH}=inventado` });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_TOKEN_INVALID');
    const cleared = res.readCookie(REFRESH);
    expect(cleared.value).toBe('');
    expect(new Date(cleared.attributes.expires).getTime()).toBeLessThan(Date.now());
  });

  it('401 AUTH_TOKEN_EXPIRED con un refresh token vencido', async () => {
    const { raw, cookie } = await loginWithCookie(almacenista);
    await RefreshToken.update({ expiresAt: new Date(Date.now() - 1000) }, { where: { tokenHash: hashToken(raw) } });
    const { status, body } = await api.post('/api/auth/refresh', { cookie });
    expect(status).toBe(401);
    expect(body.error.code).toBe('AUTH_TOKEN_EXPIRED');
  });

  it('un usuario desactivado no puede renovar y su token queda revocado', async () => {
    const temporal = await createTestUser({ name: 'desactivado' });
    const { raw, cookie } = await loginWithCookie(temporal);
    await User.update({ isActive: false }, { where: { id: temporal.id } });

    const { status, body } = await api.post('/api/auth/refresh', { cookie });
    expect(status).toBe(403);
    expect(body.error.code).toBe('AUTH_ACCOUNT_INACTIVE');
    expect((await findStoredToken(raw)).revokedAt).toBeInstanceOf(Date);
  });

  it('funciona aunque el access token ya esté vencido (no exige Authorization)', async () => {
    const { cookie } = await loginWithCookie(almacenista);
    const expired = jwt.sign({ sub: String(almacenista.id), iat: Math.floor(Date.now() / 1000) - 1000 }, process.env.JWT_SECRET, { expiresIn: 900 });
    expect((await api.post('/api/auth/refresh', { cookie, token: expired })).status).toBe(200);
  });
});

describe('POST /api/auth/logout', () => {
  it('204, registra LOGOUT, revoca el refresh token y borra la cookie', async () => {
    const { accessToken, raw, cookie } = await loginWithCookie(almacenista);
    const res = await api.post('/api/auth/logout', { token: accessToken, cookie });

    expect(res.status).toBe(204);
    expect(res.body).toBeNull();
    expect(await lastAuthEvent({ userId: almacenista.id })).toMatchObject({ eventType: 'LOGOUT' });
    expect((await findStoredToken(raw)).revokedAt).toBeInstanceOf(Date);
    expect(res.readCookie(REFRESH).value).toBe('');

    // Después de cerrar sesión, la cookie anterior ya no renueva nada.
    expect((await api.post('/api/auth/refresh', { cookie })).status).toBe(401);
  });

  it('cerrar sesión en un dispositivo no cierra las demás sesiones', async () => {
    const laptop = await loginWithCookie(almacenista);
    const phone = await loginWithCookie(almacenista);
    await api.post('/api/auth/logout', { token: laptop.accessToken, cookie: laptop.cookie });
    expect((await api.post('/api/auth/refresh', { cookie: phone.cookie })).status).toBe(200);
  });

  it('401 sin sesión', async () => {
    expect((await api.post('/api/auth/logout')).status).toBe(401);
  });
});

describe('permisos por rol con tokens reales (auth + authorizeRole)', () => {
  let protectedApi;

  beforeAll(async () => {
    const mini = express();
    mini.use(requestId);
    mini.get('/solo-admin', auth, authorizeRole(ROLE_CODES.ADMIN), (req, res) => res.json({ success: true, data: req.user }));
    mini.use(errorHandler);
    protectedApi = await startServer(mini);
  });

  afterAll(() => protectedApi?.close());

  it('ADMIN pasa y req.user trae roleCode y hierarchy de la BD', async () => {
    const { status, body } = await protectedApi.get('/solo-admin', { token: await loginAs(admin) });
    expect(status).toBe(200);
    expect(body.data).toEqual({ id: admin.id, username: admin.username, roleCode: 'ADMIN', hierarchy: 1, mustChangePassword: false });
  });

  it('ALMACENISTA recibe 403 FORBIDDEN_ROLE', async () => {
    const { status, body } = await protectedApi.get('/solo-admin', { token: await loginAs(almacenista) });
    expect(status).toBe(403);
    expect(body.error.code).toBe('FORBIDDEN_ROLE');
  });
});
