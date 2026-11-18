// Integración de las sesiones activas (HU-109) con la app real sobre inventory_test.
// Cada "dispositivo" es un login aparte con su propia cookie de refresh token.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import app from '#src/app.js';
import { sequelize } from '#src/config/database.js';
import { RefreshToken } from '#src/database/models/index.model.js';
import { startServer } from '../../helpers/http.js';
import { assertTestDatabase, createTestUser, deleteTestUsers, lastAuthEvent } from '../../helpers/db.js';

const REFRESH = 'refreshToken';
let api;

/** Inicia sesión como un dispositivo nuevo. */
const device = async (user, userAgent = 'Postman/Prueba') => {
  const res = await api.post('/api/auth/login', {
    body: { username: user.username, password: user.password },
    headers: { 'User-Agent': userAgent },
  });
  expect(res.status).toBe(200);
  return { token: res.body.data.accessToken, cookie: `${REFRESH}=${res.readCookie(REFRESH).value}` };
};

const refresh = async (dev) => {
  const res = await api.post('/api/auth/refresh', { cookie: dev.cookie });
  if (res.status === 200) {
    dev.token = res.body.data.accessToken;
    dev.cookie = `${REFRESH}=${res.readCookie(REFRESH).value}`;
  }
  return res;
};

const sessions = (dev) => api.get('/api/auth/sessions', { token: dev.token, cookie: dev.cookie });
const del = (dev, path) => api.delete(path, { token: dev.token, cookie: dev.cookie });

/** ¿La respuesta borra la cookie del refresh token? */
const clearsCookie = (res) => {
  const cookie = res.readCookie(REFRESH);
  return Boolean(cookie) && cookie.value === '';
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

describe('GET /api/auth/sessions', () => {
  it('lista las sesiones activas del usuario y marca la de este dispositivo', async () => {
    const user = await createTestUser({ name: 's.lista' });
    const laptop = await device(user, 'Mozilla/5.0 (Windows NT 10.0) Chrome/130');
    await device(user, 'Mozilla/5.0 (Android 14) Chrome/130');

    const res = await sessions(laptop);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta.count).toBe(2);
    const current = res.body.data.filter((s) => s.current);
    expect(current).toHaveLength(1);
    expect(current[0].userAgent).toMatch(/Windows/);
    expect(res.body.data[0]).toEqual({
      id: expect.stringMatching(/^\d+$/),
      userAgent: expect.any(String),
      ipAddress: expect.any(String),
      lastActiveAt: expect.any(String),
      expiresAt: expect.any(String),
      current: expect.any(Boolean),
    });
    expect(JSON.stringify(res.body)).not.toMatch(/tokenHash/);
  });

  it('no muestra sesiones cerradas ni de otros usuarios', async () => {
    const user = await createTestUser({ name: 's.solo' });
    const other = await createTestUser({ name: 's.otro' });
    const mine = await device(user);
    const closed = await device(user);
    await api.post('/api/auth/logout', { token: closed.token, cookie: closed.cookie });
    await device(other);

    const res = await sessions(mine);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].current).toBe(true);
  });

  it('sin sesión → 401', async () => {
    expect((await api.get('/api/auth/sessions')).status).toBe(401);
  });
});

describe('DELETE /api/auth/sessions/:id', () => {
  it('cierra la sesión de otro dispositivo: su refresh deja de servir y la de este sigue', async () => {
    const user = await createTestUser({ name: 's.cerrar' });
    const laptop = await device(user);
    const phone = await device(user);
    const phoneSession = (await sessions(laptop)).body.data.find((s) => !s.current);

    const res = await del(laptop, `/api/auth/sessions/${phoneSession.id}`);
    expect(res.status).toBe(204);
    expect(clearsCookie(res)).toBe(false); // no borra la cookie de este dispositivo

    expect((await refresh(phone)).status).toBe(401);
    expect((await refresh(laptop)).status).toBe(200);
    expect(await lastAuthEvent({ userId: user.id, eventType: 'LOGOUT' })).not.toBeNull();
  });

  it('acepta un id ya rotado: sigue la cadena de renovaciones hasta la sesión vigente', async () => {
    const user = await createTestUser({ name: 's.rotado' });
    const laptop = await device(user);
    const phone = await device(user);
    const staleId = (await sessions(laptop)).body.data.find((s) => !s.current).id;

    // El teléfono renueva su sesión dos veces: el id que vio la pantalla ya no es el vigente.
    await refresh(phone);
    await refresh(phone);

    expect((await del(laptop, `/api/auth/sessions/${staleId}`)).status).toBe(204);
    expect((await refresh(phone)).status).toBe(401);
  });

  it('cerrar la sesión de este mismo dispositivo borra la cookie', async () => {
    const user = await createTestUser({ name: 's.propia' });
    const laptop = await device(user);
    const own = (await sessions(laptop)).body.data.find((s) => s.current);

    const res = await del(laptop, `/api/auth/sessions/${own.id}`);
    expect(res.status).toBe(204);
    expect(clearsCookie(res)).toBe(true);
    expect((await refresh(laptop)).status).toBe(401);
  });

  it('una sesión de otro usuario, inexistente o ya cerrada → 404; id inválido → 400', async () => {
    const user = await createTestUser({ name: 's.ajena' });
    const other = await createTestUser({ name: 's.ajena.otro' });
    const mine = await device(user);
    const theirs = await device(other);
    const theirId = (await sessions(theirs)).body.data[0].id;

    const res = await del(mine, `/api/auth/sessions/${theirId}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect((await refresh(theirs)).status).toBe(200);

    expect((await del(mine, '/api/auth/sessions/999999999999')).status).toBe(404);
    expect((await del(mine, '/api/auth/sessions/abc')).status).toBe(400);
  });
});

describe('DELETE /api/auth/sessions (cerrar todas las demás)', () => {
  it('revoca todas menos la de este dispositivo', async () => {
    const user = await createTestUser({ name: 's.demas' });
    const laptop = await device(user);
    const phone = await device(user);
    const tablet = await device(user);

    const res = await del(laptop, '/api/auth/sessions');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ revokedSessions: 2, keptCurrent: true });

    expect((await refresh(phone)).status).toBe(401);
    expect((await refresh(tablet)).status).toBe(401);
    expect((await refresh(laptop)).status).toBe(200);
    expect(await RefreshToken.count({ where: { userId: user.id, revokedAt: null } })).toBe(1);
  });
});

describe('POST /api/users/:id/revoke-sessions (administrador)', () => {
  it('un ADMIN cierra todas las sesiones de un usuario de rango inferior', async () => {
    const admin = await device(await createTestUser({ name: 's.admin', roleCode: 'ADMIN' }));
    const target = await createTestUser({ name: 's.objetivo', roleCode: 'USUARIO' });
    const a = await device(target);
    const b = await device(target);

    const res = await api.post(`/api/users/${target.id}/revoke-sessions`, { token: admin.token });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ revokedSessions: 2, user: { id: target.id } });
    expect((await refresh(a)).status).toBe(401);
    expect((await refresh(b)).status).toBe(401);
  });

  it('no sobre uno mismo ni sobre alguien de igual rango; ALMACENISTA no tiene acceso', async () => {
    const adminUser = await createTestUser({ name: 's.admin2', roleCode: 'ADMIN' });
    const admin = await device(adminUser);
    const otherAdmin = await createTestUser({ name: 's.admin3', roleCode: 'ADMIN' });
    const almacenista = await device(await createTestUser({ name: 's.alm', roleCode: 'ALMACENISTA' }));

    expect((await api.post(`/api/users/${adminUser.id}/revoke-sessions`, { token: admin.token })).body.error.code).toBe(
      'FORBIDDEN_HIERARCHY'
    );
    expect((await api.post(`/api/users/${otherAdmin.id}/revoke-sessions`, { token: admin.token })).body.error.code).toBe(
      'FORBIDDEN_HIERARCHY'
    );
    expect((await api.post(`/api/users/${otherAdmin.id}/revoke-sessions`, { token: almacenista.token })).body.error.code).toBe(
      'FORBIDDEN_ROLE'
    );
  });
});
