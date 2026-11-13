// Consultas de autenticación. Es el único repository que lee passwordHash y tokenHash.
// No valida ni lanza errores de negocio: devuelve objetos planos o null y el service decide.
import { Transaction } from 'sequelize';
import { User, Role, AuthEvent, RefreshToken } from '#src/database/models/index.model.js';

const ROLE_INCLUDE = { model: Role, as: 'role', attributes: ['id', 'code', 'name', 'hierarchy', 'isActive'] };

const plain = (row) => (row ? row.get({ plain: true }) : null);

// --- Usuarios ---------------------------------------------------------------

export const findUserForLogin = async (username, { transaction } = {}) =>
  plain(await User.unscoped().findOne({ where: { username }, include: [ROLE_INCLUDE], transaction }));

export const findUserWithPasswordById = async (id, { transaction } = {}) =>
  plain(await User.unscoped().findByPk(id, { include: [ROLE_INCLUDE], transaction }));

export const findUserById = async (id, { transaction } = {}) =>
  plain(await User.findByPk(id, { include: [ROLE_INCLUDE], transaction }));

/** Estado de intentos fallidos con la fila bloqueada (FOR UPDATE), para contar sin carreras. */
export const findLoginStateForUpdate = async (id, { transaction } = {}) =>
  plain(
    await User.unscoped().findByPk(id, {
      attributes: ['id', 'failedLoginAttempts', 'lockedUntil'],
      transaction,
      lock: Transaction.LOCK.UPDATE,
    })
  );

export const updateUser = async (id, changes, { transaction } = {}) => {
  await User.update(changes, { where: { id }, transaction });
};

// --- Bitácora de seguridad --------------------------------------------------

export const createAuthEvent = async (data, { transaction } = {}) =>
  plain(await AuthEvent.create(data, { transaction }));

// --- Refresh tokens ---------------------------------------------------------

export const createRefreshToken = async (data, { transaction } = {}) =>
  plain(await RefreshToken.create(data, { transaction }));

/** Con lock: true bloquea la fila (FOR UPDATE) para que dos usos simultáneos no roten el mismo token. */
export const findRefreshTokenByHash = async (tokenHash, { transaction, lock = false } = {}) =>
  plain(
    await RefreshToken.findOne({
      where: { tokenHash },
      transaction,
      lock: lock ? Transaction.LOCK.UPDATE : undefined,
    })
  );

export const revokeRefreshToken = async (id, { revokedAt = new Date(), replacedByTokenId = null } = {}, { transaction } = {}) => {
  await RefreshToken.update({ revokedAt, replacedByTokenId }, { where: { id, revokedAt: null }, transaction });
};

/** Revoca todas las sesiones vigentes del usuario. Devuelve cuántas se revocaron. */
export const revokeAllRefreshTokens = async (userId, { transaction } = {}) => {
  const [count] = await RefreshToken.update(
    { revokedAt: new Date() },
    { where: { userId, revokedAt: null }, transaction }
  );
  return count;
};
