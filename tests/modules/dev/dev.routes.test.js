// Endpoint de desarrollo POST /api/dev/reset-token: solo responde fuera de producción, con
// ENABLE_DEV_TOOLS=true y desde localhost; en cualquier otro caso es indistinguible de una ruta inexistente.
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import app from '#src/app.js';
import { sequelize } from '#src/config/database.js';
import { isLoopback } from '#src/modules/dev/dev.guard.js';
import { startServer } from '../../helpers/http.js';
import { assertTestDatabase, createTestUser, deleteTestUsers } from '../../helpers/db.js';

let api;
const saved = { ENABLE_DEV_TOOLS: process.env.ENABLE_DEV_TOOLS, NODE_ENV: process.env.NODE_ENV };

const getToken = (email) => api.post('/api/dev/reset-token', { body: { email } });

beforeAll(async () => {
  assertTestDatabase();
  await deleteTestUsers();
  api = await startServer(app);
});

afterEach(() => {
  process.env.NODE_ENV = saved.NODE_ENV;
  if (saved.ENABLE_DEV_TOOLS === undefined) delete process.env.ENABLE_DEV_TOOLS;
  else process.env.ENABLE_DEV_TOOLS = saved.ENABLE_DEV_TOOLS;
});

afterAll(async () => {
  await api?.close();
  await deleteTestUsers();
  await sequelize.close();
});

describe('POST /api/dev/reset-token', () => {
  it('con ENABLE_DEV_TOOLS=true entrega un token que sirve para restablecer', async () => {
    process.env.ENABLE_DEV_TOOLS = 'true';
    const user = await createTestUser({ name: 'dev.token' });
    const email = `${user.username}@aztlan.test`;
    await api.post('/api/auth/forgot-password', { body: { email } });

    const { status, body } = await getToken(email);
    expect(status).toBe(200);
    expect(body.data.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(body.data.link).toContain('/reset-password?token=');

    const reset = await api.post('/api/auth/reset-password', { body: { token: body.data.token, newPassword: 'Desde-Postman-2026' } });
    expect(reset.status).toBe(204);
  });

  it('sin solicitud pendiente responde 404 NOT_FOUND con la indicación', async () => {
    process.env.ENABLE_DEV_TOOLS = 'true';
    const { status, body } = await getToken('test.sin-solicitud@aztlan.test');
    expect(status).toBe(404);
    expect(body.error).toMatchObject({ code: 'NOT_FOUND', message: expect.stringMatching(/forgot-password/) });
  });

  it('valida el correo', async () => {
    process.env.ENABLE_DEV_TOOLS = 'true';
    expect((await getToken('no-es-correo')).status).toBe(400);
  });

  it('sin ENABLE_DEV_TOOLS responde ROUTE_NOT_FOUND, como si no existiera', async () => {
    delete process.env.ENABLE_DEV_TOOLS;
    const { status, body } = await getToken('cualquiera@aztlan.test');
    expect(status).toBe(404);
    expect(body.error.code).toBe('ROUTE_NOT_FOUND');
  });

  it('en producción responde ROUTE_NOT_FOUND aunque ENABLE_DEV_TOOLS=true', async () => {
    process.env.ENABLE_DEV_TOOLS = 'true';
    process.env.NODE_ENV = 'production';
    expect((await getToken('cualquiera@aztlan.test')).body.error.code).toBe('ROUTE_NOT_FOUND');
  });
});

describe('isLoopback', () => {
  it.each([
    ['127.0.0.1', true],
    ['::1', true],
    ['::ffff:127.0.0.1', true],
    ['192.168.1.20', false],
    ['::ffff:10.0.0.5', false],
    [undefined, false],
  ])('%s → %s', (ip, expected) => {
    expect(isLoopback(ip)).toBe(expected);
  });
});
