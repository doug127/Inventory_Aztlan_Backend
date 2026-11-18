// Integración de la gestión de usuarios (HU-107) y del soporte de cuentas (HU-108) con la app real
// sobre inventory_test. La contraseña temporal y el token de recuperación se obtienen como lo hace
// el worker al enviar el correo (prepareWelcomeForDelivery / prepareResetTokenForDelivery).
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { Op } from 'sequelize';
import app from '#src/app.js';
import { sequelize } from '#src/config/database.js';
import { PasswordResetToken, RefreshToken, Role, User } from '#src/database/models/index.model.js';
import { prepareResetTokenForDelivery, prepareWelcomeForDelivery } from '#src/modules/auth/auth.service.js';
import { startServer } from '../../helpers/http.js';
import { TEST_PREFIX, assertTestDatabase, createTestUser, deleteTestUsers, findEmails, lastAuthEvent } from '../../helpers/db.js';

let api;
let admin; // { ...user, token }
let superadmin;
const savedDevTools = process.env.ENABLE_DEV_TOOLS;

const login = async (user, password = user.password) => {
  const res = await api.post('/api/auth/login', { body: { username: user.username, password } });
  return res;
};
const sessionOf = async (user) => {
  const res = await login(user);
  expect(res.status).toBe(200);
  return { ...user, token: res.body.data.accessToken, refreshCookie: `refreshToken=${res.readCookie('refreshToken').value}` };
};

const newUserBody = (name, roleCode = 'ALMACENISTA') => ({
  username: `${TEST_PREFIX}${name}`,
  fullName: `Usuario Nuevo ${name}`,
  email: `${TEST_PREFIX}${name}@aztlan.test`,
  roleCode,
});

const as = (actor) => ({
  get: (path) => api.get(path, { token: actor.token }),
  post: (path, body) => api.post(path, { token: actor.token, body }),
  patch: (path, body) => api.patch(path, { token: actor.token, body }),
});

beforeAll(async () => {
  assertTestDatabase();
  await deleteTestUsers();
  api = await startServer(app);
  admin = await sessionOf(await createTestUser({ name: 'u.admin', roleCode: 'ADMIN' }));
  superadmin = await sessionOf(await createTestUser({ name: 'u.super', roleCode: 'SUPERADMIN' }));
});

afterEach(() => {
  if (savedDevTools === undefined) delete process.env.ENABLE_DEV_TOOLS;
  else process.env.ENABLE_DEV_TOOLS = savedDevTools;
});

afterAll(async () => {
  await api?.close();
  await deleteTestUsers();
  await sequelize.close();
});

describe('acceso', () => {
  it('sin sesión → 401; ALMACENISTA y USUARIO → 403 FORBIDDEN_ROLE', async () => {
    expect((await api.get('/api/users')).status).toBe(401);
    for (const roleCode of ['ALMACENISTA', 'USUARIO']) {
      const actor = await sessionOf(await createTestUser({ name: `u.sinpermiso.${roleCode.toLowerCase()}`, roleCode }));
      const res = await as(actor).get('/api/users');
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
    }
  });
});

describe('POST /api/users (alta)', () => {
  it('crea el usuario con must_change_password y encola WELCOME; la contraseña temporal sirve para entrar', async () => {
    const res = await as(admin).post('/api/users', { ...newUserBody('u.alta'), username: '  TEST.U.ALTA ' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      username: 'test.u.alta',
      role: { code: 'ALMACENISTA' },
      isActive: true,
      mustChangePassword: true,
      isLocked: false,
    });
    expect(res.body.data).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|temporaryPassword/);

    const created = res.body.data;
    const [welcome] = await findEmails({ userId: created.id, template: 'WELCOME' });
    expect(welcome).toMatchObject({ toEmail: 'test.u.alta@aztlan.test', status: 'PENDING', subject: 'Bienvenido a Inventario Aztlan' });

    // Lo que hace el worker al enviar: genera la contraseña temporal (solo queda su hash).
    const { temporaryPassword } = await prepareWelcomeForDelivery(created.id);
    expect(temporaryPassword).toMatch(/^(?=.*[A-Z])(?=.*[a-z])(?=.*\d).{12}$/);
    const first = await login({ username: 'test.u.alta' }, temporaryPassword);
    expect(first.status).toBe(200);
    expect(first.body.data.user.mustChangePassword).toBe(true);

    // Ya inició sesión: un reintento del correo no genera otra contraseña.
    expect(await prepareWelcomeForDelivery(created.id)).toBeNull();
  });

  it('un reintento del WELCOME genera otra contraseña y anula la anterior', async () => {
    const { body } = await as(admin).post('/api/users', newUserBody('u.reintento', 'USUARIO'));
    const { temporaryPassword: first } = await prepareWelcomeForDelivery(body.data.id);
    const { temporaryPassword: second } = await prepareWelcomeForDelivery(body.data.id);
    expect((await login({ username: 'test.u.reintento' }, first)).status).toBe(401);
    expect((await login({ username: 'test.u.reintento' }, second)).status).toBe(200);
  });

  it('antes de enviarse el WELCOME nadie conoce la contraseña', async () => {
    await as(admin).post('/api/users', newUserBody('u.sinclave', 'USUARIO'));
    expect((await login({ username: 'test.u.sinclave' }, 'Clave-Prueba-1')).status).toBe(401);
  });

  it('un ADMIN no puede crear un ADMIN → 403 FORBIDDEN_HIERARCHY (criterio del Módulo 3)', async () => {
    const res = await as(admin).post('/api/users', newUserBody('u.otroadmin', 'ADMIN'));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN_HIERARCHY');
    expect(await User.count({ where: { username: 'test.u.otroadmin' } })).toBe(0);
  });

  it('el SUPERADMIN sí puede crear un ADMIN', async () => {
    const res = await as(superadmin).post('/api/users', newUserBody('u.admin2', 'ADMIN'));
    expect(res.status).toBe(201);
    expect(res.body.data.role.code).toBe('ADMIN');
  });

  it('username o correo repetido → 409 DUPLICATE_CODE por campo', async () => {
    await as(admin).post('/api/users', newUserBody('u.dup', 'USUARIO'));
    const res = await as(admin).post('/api/users', newUserBody('u.dup', 'USUARIO'));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_CODE');
    expect(res.body.error.details.map((d) => d.path).sort()).toEqual(['email', 'username']);
  });

  it('valida los campos (username, correo, rol, campos extra)', async () => {
    const res = await as(admin).post('/api/users', { username: '1malo', fullName: 'A', email: 'no-es-correo', roleCode: 'JEFE', password: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const paths = res.body.error.details.map((d) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['username', 'fullName', 'email', 'roleCode']));
  });
});

describe('GET /api/users y /assignable-roles', () => {
  it('un ADMIN solo ve usuarios de rango inferior, con paginación y filtros', async () => {
    await createTestUser({ name: 'u.lista.a', roleCode: 'USUARIO' });
    await createTestUser({ name: 'u.lista.b', roleCode: 'USUARIO', isActive: false });

    const res = await as(admin).get('/api/users?search=test.u.lista&limit=1&sort=username&order=asc');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].username).toBe('test.u.lista.a');
    expect(res.body.meta.pagination).toMatchObject({ page: 1, limit: 1, totalItems: 2, totalPages: 2, hasNextPage: true });
    expect(res.body.meta.search).toBe('test.u.lista');
    expect(res.body.meta.sort).toEqual({ field: 'username', order: 'asc' });

    const all = await as(admin).get('/api/users?limit=100');
    expect(all.body.data.every((u) => u.role.hierarchy > 1)).toBe(true);

    const inactive = await as(admin).get('/api/users?search=test.u.lista&isActive=false');
    expect(inactive.body.data.map((u) => u.username)).toEqual(['test.u.lista.b']);
    expect(inactive.body.meta.filters).toEqual({ isActive: false });
  });

  it('query inválida → 400', async () => {
    expect((await as(admin).get('/api/users?limit=500')).status).toBe(400);
    expect((await as(admin).get('/api/users?sort=password')).status).toBe(400);
  });

  it('roles asignables según el rango', async () => {
    expect((await as(admin).get('/api/users/assignable-roles')).body.data.map((r) => r.code)).toEqual(['ALMACENISTA', 'USUARIO']);
    expect((await as(superadmin).get('/api/users/assignable-roles')).body.data.map((r) => r.code)).toEqual([
      'SUPERADMIN',
      'ADMIN',
      'ALMACENISTA',
      'USUARIO',
    ]);
  });

  it('GET /:id de alguien de igual rango → 403; inexistente → 404; id inválido → 400', async () => {
    const other = await createTestUser({ name: 'u.ficha.admin', roleCode: 'ADMIN' });
    expect((await as(admin).get(`/api/users/${other.id}`)).status).toBe(403);
    expect((await as(admin).get('/api/users/99999999')).status).toBe(404);
    expect((await as(admin).get('/api/users/abc')).status).toBe(400);
  });
});

describe('PATCH /api/users/:id', () => {
  it('edita datos y rol; el cambio de rol aplica en la siguiente petición del usuario', async () => {
    const target = await sessionOf(await createTestUser({ name: 'u.editar', roleCode: 'ALMACENISTA' }));
    const res = await as(admin).patch(`/api/users/${target.id}`, { fullName: '  Pedro   Editado ', roleCode: 'usuario' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ fullName: 'Pedro Editado', role: { code: 'USUARIO' } });

    const me = await api.get('/api/auth/me', { token: target.token });
    expect(me.body.data.role.code).toBe('USUARIO');
  });

  it('un ADMIN no asciende a nadie a ADMIN ni edita a otro ADMIN', async () => {
    const almacenista = await createTestUser({ name: 'u.ascenso', roleCode: 'ALMACENISTA' });
    const otherAdmin = await createTestUser({ name: 'u.par', roleCode: 'ADMIN' });
    expect((await as(admin).patch(`/api/users/${almacenista.id}`, { roleCode: 'ADMIN' })).body.error.code).toBe('FORBIDDEN_HIERARCHY');
    expect((await as(admin).patch(`/api/users/${otherAdmin.id}`, { fullName: 'Otro Nombre' })).body.error.code).toBe('FORBIDDEN_HIERARCHY');
  });

  it('nadie cambia su propio rol', async () => {
    const res = await as(superadmin).patch(`/api/users/${superadmin.id}`, { roleCode: 'ADMIN' });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatchObject({ code: 'FORBIDDEN_HIERARCHY', message: 'No puede cambiar su propio rol' });
  });

  it('cuerpo vacío → 400; correo de otro usuario → 409', async () => {
    const target = await createTestUser({ name: 'u.vacio', roleCode: 'USUARIO' });
    expect((await as(admin).patch(`/api/users/${target.id}`, {})).status).toBe(400);
    const res = await as(admin).patch(`/api/users/${target.id}`, { email: `${admin.username}@aztlan.test` });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_CODE');
  });
});

describe('desactivar y reactivar', () => {
  it('desactivar corta el acceso de inmediato: access token, refresh y enlace de recuperación', async () => {
    const target = await sessionOf(await createTestUser({ name: 'u.baja', roleCode: 'USUARIO' }));
    await api.post('/api/auth/forgot-password', { body: { email: `${target.username}@aztlan.test` } });

    const res = await as(admin).post(`/api/users/${target.id}/deactivate`);
    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(false);

    expect((await api.get('/api/auth/me', { token: target.token })).body.error.code).toBe('AUTH_ACCOUNT_INACTIVE');
    expect((await api.post('/api/auth/refresh', { cookie: target.refreshCookie })).status).toBe(401);
    expect(await RefreshToken.count({ where: { userId: target.id, revokedAt: null } })).toBe(0);
    expect(await PasswordResetToken.count({ where: { userId: target.id, usedAt: null, invalidatedAt: null } })).toBe(0);

    const again = await as(admin).post(`/api/users/${target.id}/activate`);
    expect(again.body.data.isActive).toBe(true);
    expect((await login(target)).status).toBe(200);
  });

  it('nadie se desactiva a sí mismo', async () => {
    const res = await as(admin).post(`/api/users/${admin.id}/deactivate`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN_HIERARCHY');
  });

  it('el único SUPERADMIN activo no puede desactivarse → 409 LAST_SUPERADMIN (criterio del Módulo 3)', async () => {
    const superRole = await Role.findOne({ where: { code: 'SUPERADMIN' } });
    const others = await User.findAll({
      where: { roleId: superRole.id, isActive: true, id: { [Op.ne]: superadmin.id } },
      attributes: ['id'],
    });
    const otherIds = others.map((u) => u.id);
    try {
      await User.update({ isActive: false }, { where: { id: otherIds } });
      const res = await as(superadmin).post(`/api/users/${superadmin.id}/deactivate`);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('LAST_SUPERADMIN');
    } finally {
      await User.update({ isActive: true }, { where: { id: otherIds } });
    }
  });
});

describe('HU-108: POST /api/users/:id/unlock', () => {
  it('desbloquea una cuenta bloqueada por intentos fallidos y registra ACCOUNT_UNLOCKED', async () => {
    const target = await createTestUser({ name: 'u.bloqueado', roleCode: 'ALMACENISTA' });
    for (let i = 0; i < 5; i += 1) await login(target, 'Equivocada-1');
    expect((await login(target)).status).toBe(423);

    const res = await as(admin).post(`/api/users/${target.id}/unlock`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ wasLocked: true, user: { isLocked: false, failedLoginAttempts: 0, lockedUntil: null } });
    expect(await lastAuthEvent({ userId: target.id, eventType: 'ACCOUNT_UNLOCKED' })).not.toBeNull();
    expect((await login(target)).status).toBe(200);
  });

  it('sobre una cuenta no bloqueada responde wasLocked=false y no registra evento', async () => {
    const target = await createTestUser({ name: 'u.nobloqueado', roleCode: 'USUARIO' });
    const res = await as(admin).post(`/api/users/${target.id}/unlock`);
    expect(res.body.data.wasLocked).toBe(false);
    expect(await lastAuthEvent({ userId: target.id, eventType: 'ACCOUNT_UNLOCKED' })).toBeNull();
  });

  it('un ADMIN no desbloquea a otro ADMIN', async () => {
    const other = await createTestUser({ name: 'u.bloq.admin', roleCode: 'ADMIN' });
    expect((await as(admin).post(`/api/users/${other.id}/unlock`)).body.error.code).toBe('FORBIDDEN_HIERARCHY');
  });
});

describe('HU-108: POST /api/users/:id/force-password-reset', () => {
  it('anula la contraseña, cierra sesiones y envía PASSWORD_RESET; el enlace permite fijar una nueva', async () => {
    const target = await sessionOf(await createTestUser({ name: 'u.forzado', roleCode: 'ALMACENISTA' }));

    const res = await as(admin).post(`/api/users/${target.id}/force-password-reset`);
    expect(res.status).toBe(202);
    expect(res.body.data).toMatchObject({ revokedSessions: 1, user: { id: target.id }, message: expect.stringMatching(/correo/) });

    // La contraseña anterior y las sesiones ya no sirven.
    expect((await login(target)).status).toBe(401);
    expect((await api.get('/api/auth/me', { token: target.token })).status).toBe(401);
    expect((await api.post('/api/auth/refresh', { cookie: target.refreshCookie })).status).toBe(401);
    expect(await lastAuthEvent({ userId: target.id, eventType: 'PASSWORD_RESET_REQUESTED' })).not.toBeNull();

    // El correo lleva un enlace de recuperación (HU-105) que permite fijar la contraseña nueva.
    const [email] = await findEmails({ userId: target.id, template: 'PASSWORD_RESET' });
    const { token } = await prepareResetTokenForDelivery(email.passwordResetTokenId);
    const reset = await api.post('/api/auth/reset-password', { body: { token, newPassword: 'Nueva-Forzada-2026' } });
    expect(reset.status).toBe(204);
    expect((await login(target, 'Nueva-Forzada-2026')).status).toBe(200);
  });

  it('usuario desactivado → 409 INACTIVE_RESOURCE; uno mismo → 403', async () => {
    const inactive = await createTestUser({ name: 'u.forzado.inactivo', roleCode: 'USUARIO', isActive: false });
    expect((await as(admin).post(`/api/users/${inactive.id}/force-password-reset`)).body.error.code).toBe('INACTIVE_RESOURCE');
    expect((await as(admin).post(`/api/users/${admin.id}/force-password-reset`)).status).toBe(403);
  });
});

describe('POST /api/dev/welcome-password', () => {
  it('con ENABLE_DEV_TOOLS=true entrega la contraseña temporal del alta', async () => {
    process.env.ENABLE_DEV_TOOLS = 'true';
    const body = newUserBody('u.devwelcome', 'USUARIO');
    await as(admin).post('/api/users', body);

    const res = await api.post('/api/dev/welcome-password', { body: { email: body.email } });
    expect(res.status).toBe(200);
    expect((await login({ username: body.username }, res.body.data.temporaryPassword)).status).toBe(200);
  });

  it('sin ENABLE_DEV_TOOLS → 404 como una ruta inexistente', async () => {
    delete process.env.ENABLE_DEV_TOOLS;
    const res = await api.post('/api/dev/welcome-password', { body: { email: 'test.x@aztlan.test' } });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ROUTE_NOT_FOUND');
  });
});

describe('estado de sesiones en la lista y en la ficha (HU-109)', () => {
  it('cada usuario trae sus sesiones abiertas y su estado de conexión', async () => {
    const online = await createTestUser({ name: 'u.conectado', roleCode: 'USUARIO' });
    await sessionOf(online);
    await sessionOf(online);
    const offline = await createTestUser({ name: 'u.desconectado', roleCode: 'USUARIO' });

    const res = await as(admin).get('/api/users?search=test.u.&limit=100');
    const byName = Object.fromEntries(res.body.data.map((u) => [u.username, u]));
    expect(byName['test.u.conectado'].sessions).toMatchObject({ active: 2, status: 'ONLINE', lastActivityAt: expect.any(String) });
    expect(byName['test.u.desconectado'].sessions).toEqual({ active: 0, lastActivityAt: null, status: 'OFFLINE' });

    const connected = await as(admin).get('/api/users?search=test.u.&connected=true&limit=100');
    const names = connected.body.data.map((u) => u.username);
    expect(names).toContain('test.u.conectado');
    expect(names).not.toContain('test.u.desconectado');
    expect((await as(admin).get(`/api/users/${offline.id}`)).body.data.sessions.status).toBe('OFFLINE');
  });

  it('GET /:id/sessions lista los dispositivos del usuario; tras cerrarlas queda desconectado', async () => {
    const target = await createTestUser({ name: 'u.dispositivos', roleCode: 'ALMACENISTA' });
    await sessionOf(target);

    const res = await as(admin).get(`/api/users/${target.id}/sessions`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({ id: expect.any(String), current: false, ipAddress: expect.any(String) });

    await as(admin).post(`/api/users/${target.id}/revoke-sessions`);
    expect((await as(admin).get(`/api/users/${target.id}`)).body.data.sessions).toMatchObject({ active: 0, status: 'OFFLINE' });
  });

  it('un ADMIN no ve las sesiones de otro ADMIN', async () => {
    const other = await createTestUser({ name: 'u.sesiones.admin', roleCode: 'ADMIN' });
    expect((await as(admin).get(`/api/users/${other.id}/sessions`)).body.error.code).toBe('FORBIDDEN_HIERARCHY');
  });
});
