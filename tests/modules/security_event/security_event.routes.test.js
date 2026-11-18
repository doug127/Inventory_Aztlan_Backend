// Integración de la bitácora de seguridad (HU-110) con la app real sobre inventory_test.
// Los eventos se generan con logins reales; cada prueba filtra por sus propios usuarios.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import app from '#src/app.js';
import { sequelize } from '#src/config/database.js';
import { startServer } from '../../helpers/http.js';
import { assertTestDatabase, createTestUser, deleteTestUsers, lastAuthEvent } from '../../helpers/db.js';

let api;
let admin;
let superadmin;

const tokenOf = async (user) =>
  (await api.post('/api/auth/login', { body: { username: user.username, password: user.password } })).body.data.accessToken;

const failLogin = (username) => api.post('/api/auth/login', { body: { username, password: 'Equivocada-1' } });

const events = (token, query = '') => api.get(`/api/security-events${query}`, { token });

beforeAll(async () => {
  assertTestDatabase();
  await deleteTestUsers();
  api = await startServer(app);
  admin = { ...(await createTestUser({ name: 'se.admin', roleCode: 'ADMIN' })) };
  admin.token = await tokenOf(admin);
  superadmin = { ...(await createTestUser({ name: 'se.super', roleCode: 'SUPERADMIN' })) };
  superadmin.token = await tokenOf(superadmin);
});

afterAll(async () => {
  await api?.close();
  await deleteTestUsers();
  await sequelize.close();
});

describe('acceso', () => {
  it('solo el SUPERADMIN: ADMIN, ALMACENISTA y USUARIO → 403 FORBIDDEN_ROLE; sin sesión → 401', async () => {
    expect((await api.get('/api/security-events')).status).toBe(401);
    expect((await events(admin.token)).body.error.code).toBe('FORBIDDEN_ROLE');
    expect((await api.get('/api/security-events/event-types', { token: admin.token })).status).toBe(403);
    for (const roleCode of ['ALMACENISTA', 'USUARIO']) {
      const user = await createTestUser({ name: `se.sin.${roleCode.toLowerCase()}`, roleCode });
      const res = await events(await tokenOf(user));
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
    }
  });
});

describe('GET /api/security-events', () => {
  it('lista los eventos de un usuario con el más reciente primero, paginados y con datos del usuario', async () => {
    const user = await createTestUser({ name: 'se.pedro', roleCode: 'ALMACENISTA' });
    await failLogin(user.username);
    await failLogin(user.username);
    await tokenOf(user);

    const res = await events(superadmin.token, `?userId=${user.id}&limit=2`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((e) => e.eventType)).toEqual(['LOGIN_SUCCESS', 'LOGIN_FAILED']);
    expect(res.body.data[0]).toMatchObject({
      id: expect.stringMatching(/^\d+$/),
      ipAddress: expect.any(String),
      usernameAttempted: user.username,
      user: { id: user.id, username: user.username, role: { code: 'ALMACENISTA' } },
    });
    expect(res.body.meta.pagination).toMatchObject({ page: 1, limit: 2, totalItems: 3, totalPages: 2, hasNextPage: true });
    expect(res.body.meta.filters).toEqual({ userId: user.id });
    expect(res.body.meta.sort).toEqual({ field: 'createdAt', order: 'desc' });
  });

  it('filtra por uno o varios tipos de evento', async () => {
    const user = await createTestUser({ name: 'se.tipos', roleCode: 'USUARIO' });
    for (let i = 0; i < 5; i += 1) await failLogin(user.username); // el 5.º bloquea la cuenta

    const locked = await events(superadmin.token, `?userId=${user.id}&eventType=account_locked`);
    expect(locked.body.data.map((e) => e.eventType)).toEqual(['ACCOUNT_LOCKED']);

    const both = await events(superadmin.token, `?userId=${user.id}&eventType=ACCOUNT_LOCKED,LOGIN_FAILED`);
    expect(both.body.meta.pagination.totalItems).toBe(6);
    expect(both.body.meta.filters.eventType).toEqual(['ACCOUNT_LOCKED', 'LOGIN_FAILED']);
  });

  it('busca por username, incluidos los intentos con usuarios inexistentes', async () => {
    await failLogin('test.se.fantasma');
    const res = await events(superadmin.token, '?username=se.fantasma');
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({ eventType: 'LOGIN_FAILED', usernameAttempted: 'test.se.fantasma', user: null });
  });

  it('filtra por IP y por rango de fechas (to con solo la fecha incluye ese día)', async () => {
    const user = await createTestUser({ name: 'se.ip', roleCode: 'USUARIO' });
    await failLogin(user.username);
    const { ipAddress, createdAt } = await lastAuthEvent({ userId: user.id });
    const day = (offset) => {
      const d = new Date(createdAt);
      d.setDate(d.getDate() + offset);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    const byIp = await events(superadmin.token, `?userId=${user.id}&ip=${encodeURIComponent(ipAddress)}`);
    expect(byIp.body.data).toHaveLength(1);
    expect((await events(superadmin.token, `?userId=${user.id}&ip=10.99.99.99`)).body.data).toHaveLength(0);

    expect((await events(superadmin.token, `?userId=${user.id}&from=${day(0)}&to=${day(0)}`)).body.data).toHaveLength(1);
    expect((await events(superadmin.token, `?userId=${user.id}&to=${day(-1)}`)).body.data).toHaveLength(0);
    expect((await events(superadmin.token, `?userId=${user.id}&from=${day(1)}`)).body.data).toHaveLength(0);
  });

  it('el SUPERADMIN ve los eventos de todos los roles, incluidos ADMIN y otros SUPERADMIN', async () => {
    const otherAdmin = await createTestUser({ name: 'se.admin.otro', roleCode: 'ADMIN' });
    const otherSuper = await createTestUser({ name: 'se.super.otro', roleCode: 'SUPERADMIN' });
    await failLogin(otherAdmin.username);
    await failLogin(otherSuper.username);

    expect((await events(superadmin.token, `?userId=${otherAdmin.id}`)).body.data).toHaveLength(1);
    expect((await events(superadmin.token, `?userId=${otherSuper.id}`)).body.data[0].user.role.code).toBe('SUPERADMIN');
  });

  it('query inválida → 400 VALIDATION_ERROR', async () => {
    for (const query of ['?eventType=HACKEO', '?ip=999.1.1.1', '?from=ayer', '?limit=1000', '?from=2026-11-10&to=2026-11-01']) {
      const res = await events(superadmin.token, query);
      expect(res.status, query).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });
});

describe('GET /api/security-events/event-types', () => {
  it('devuelve el catálogo de tipos', async () => {
    const res = await api.get('/api/security-events/event-types', { token: superadmin.token });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(expect.arrayContaining(['LOGIN_SUCCESS', 'LOGIN_FAILED', 'ACCOUNT_LOCKED', 'ACCOUNT_UNLOCKED']));
  });
});
