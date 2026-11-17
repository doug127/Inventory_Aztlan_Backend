// Seeder de usuarios de prueba sobre la base de pruebas: contraseña común desde .env, un usuario por
// rol, must_change_password = true e idempotente (volver a ejecutarlo los restablece).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcrypt';
import { sequelize } from '#src/config/database.js';
import { RefreshToken, Role, User } from '#src/database/models/index.model.js';
import { DEMO_USERS, down, up } from '#src/database/seeders/20261109100010-seed-demo-users.js';
import { assertTestDatabase } from '../helpers/db.js';

const queryInterface = sequelize.getQueryInterface();
const PASSWORD = 'Demo-Usuarios-2026';
const env = {};

const findDemo = async () =>
  User.unscoped().findAll({
    where: { username: DEMO_USERS.map((u) => u.username) },
    include: [{ model: Role, as: 'role' }],
    order: [['username', 'ASC']],
  });

beforeAll(async () => {
  assertTestDatabase();
  for (const key of ['SEED_USERS_PASSWORD', 'SEED_USERS_EMAIL_DOMAIN']) env[key] = process.env[key];
  process.env.SEED_USERS_PASSWORD = PASSWORD;
  delete process.env.SEED_USERS_EMAIL_DOMAIN;
  await down(queryInterface);
});

afterAll(async () => {
  await down(queryInterface);
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await sequelize.close();
});

describe('seeder de usuarios de prueba', () => {
  it('crea un usuario por cada rol operativo, todos con la contraseña común y cambio obligatorio', async () => {
    await up(queryInterface);
    const users = await findDemo();

    expect(users).toHaveLength(DEMO_USERS.length);
    expect(new Set(users.map((u) => u.role.code))).toEqual(new Set(['ADMIN', 'ALMACENISTA', 'USUARIO']));
    for (const user of users) {
      expect(await bcrypt.compare(PASSWORD, user.passwordHash), user.username).toBe(true);
      expect(user.mustChangePassword).toBe(true);
      expect(user.email).toBe(`${user.username}@aztlan.local`);
    }
  });

  it('es idempotente: volver a ejecutarlo restablece contraseña, cambio obligatorio, bloqueo y sesiones', async () => {
    const pedro = await User.unscoped().findOne({ where: { username: 'pedro.gomez' } });
    await pedro.update({
      passwordHash: await bcrypt.hash('Otra-Clave-2026', 4),
      mustChangePassword: false,
      failedLoginAttempts: 5,
      lockedUntil: new Date(Date.now() + 60_000),
      isActive: false,
    });
    await RefreshToken.create({ userId: pedro.id, tokenHash: 'b'.repeat(64), expiresAt: new Date(Date.now() + 60_000) });

    await up(queryInterface);

    await pedro.reload();
    expect(await bcrypt.compare(PASSWORD, pedro.passwordHash)).toBe(true);
    expect(pedro).toMatchObject({ mustChangePassword: true, failedLoginAttempts: 0, lockedUntil: null, isActive: true });
    expect(await RefreshToken.count({ where: { userId: pedro.id, revokedAt: null } })).toBe(0);
    expect(await findDemo()).toHaveLength(DEMO_USERS.length);
  });

  it('usa SEED_SUPERADMIN_PASSWORD si no se define SEED_USERS_PASSWORD, y valida la política', async () => {
    const saved = { users: process.env.SEED_USERS_PASSWORD, admin: process.env.SEED_SUPERADMIN_PASSWORD };
    try {
      delete process.env.SEED_USERS_PASSWORD;
      process.env.SEED_SUPERADMIN_PASSWORD = 'Comun-Para-Todos-1';
      await up(queryInterface);
      const [first] = await findDemo();
      expect(await bcrypt.compare('Comun-Para-Todos-1', first.passwordHash)).toBe(true);

      process.env.SEED_USERS_PASSWORD = 'debil';
      await expect(up(queryInterface)).rejects.toThrow(/política/);
    } finally {
      process.env.SEED_USERS_PASSWORD = saved.users;
      if (saved.admin === undefined) delete process.env.SEED_SUPERADMIN_PASSWORD;
      else process.env.SEED_SUPERADMIN_PASSWORD = saved.admin;
    }
  });
});
