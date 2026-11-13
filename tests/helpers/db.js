// Utilidades de BD para pruebas de integración. Solo operan sobre la base de pruebas.
import bcrypt from 'bcrypt';
import { Op } from 'sequelize';
import { sequelize } from '#src/config/database.js';
import { AuthEvent, EmailOutbox, Role, User } from '#src/database/models/index.model.js';

export const TEST_PREFIX = 'test.';

/** Detiene la suite si la conexión no apunta a una base "_test": nunca se toca desarrollo. */
export const assertTestDatabase = () => {
  const name = sequelize.getDatabaseName();
  if (!name?.endsWith('_test')) {
    throw new Error(`Las pruebas de integración solo corren sobre una base *_test (conectado a "${name}")`);
  }
};

/** Crea un usuario de prueba con su contraseña en claro conocida. Costo bcrypt bajo para ir rápido. */
export const createTestUser = async ({
  name,
  roleCode = 'ALMACENISTA',
  password = 'Clave-Prueba-1',
  isActive = true,
  mustChangePassword = false,
} = {}) => {
  const role = await Role.findOne({ where: { code: roleCode } });
  const username = `${TEST_PREFIX}${name}`;
  const user = await User.create({
    username,
    email: `${username}@aztlan.test`,
    passwordHash: await bcrypt.hash(password, 4),
    fullName: `Usuario de prueba ${name}`,
    roleId: role.id,
    isActive,
    mustChangePassword,
  });
  return { id: user.id, username, password, roleCode };
};

/** Borra los usuarios de prueba con sus eventos de seguridad y sus correos encolados. */
export const deleteTestUsers = async () => {
  const users = await User.findAll({ where: { username: { [Op.startsWith]: TEST_PREFIX } }, attributes: ['id'] });
  const ids = users.map((u) => u.id);
  await AuthEvent.destroy({
    where: { [Op.or]: [{ userId: ids }, { usernameAttempted: { [Op.startsWith]: TEST_PREFIX } }] },
  });
  await EmailOutbox.destroy({ where: { [Op.or]: [{ userId: ids }, { toEmail: { [Op.startsWith]: TEST_PREFIX } }] } });
  await User.destroy({ where: { id: ids } });
};

export const lastAuthEvent = async (where) =>
  (await AuthEvent.findOne({ where, order: [['id', 'DESC']] }))?.get({ plain: true }) ?? null;

export const findEmails = async (where) =>
  (await EmailOutbox.findAll({ where, order: [['id', 'ASC']] })).map((row) => row.get({ plain: true }));
