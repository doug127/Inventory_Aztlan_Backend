// Consultas de autenticación. Es el único repository que lee passwordHash y tokenHash.
// No valida ni lanza errores de negocio: devuelve objetos planos o null y el service decide.
import { Op, Transaction } from 'sequelize';
import { User, Role, AuthEvent, RefreshToken, PasswordResetToken } from '#src/database/models/index.model.js';

const ROLE_INCLUDE = { model: Role, as: 'role', attributes: ['id', 'code', 'name', 'hierarchy', 'isActive'] };

const plain = (row) => (row ? row.get({ plain: true }) : null);

// --- Usuarios ---------------------------------------------------------------

export const findUserForLogin = async (username, { transaction } = {}) =>
  plain(await User.unscoped().findOne({ where: { username }, include: [ROLE_INCLUDE], transaction }));

export const findUserWithPasswordById = async (id, { transaction } = {}) =>
  plain(await User.unscoped().findByPk(id, { include: [ROLE_INCLUDE], transaction }));

export const findUserById = async (id, { transaction } = {}) =>
  plain(await User.findByPk(id, { include: [ROLE_INCLUDE], transaction }));

export const findUserByEmail = async (email, { transaction } = {}) =>
  plain(await User.findOne({ where: { email }, transaction }));

/** Bloquea la fila del usuario (FOR UPDATE) para serializar operaciones sobre su cuenta. */
export const lockUser = async (id, { transaction } = {}) =>
  plain(await User.findByPk(id, { attributes: ['id'], transaction, lock: Transaction.LOCK.UPDATE }));

/** Estado de intentos fallidos con la fila bloqueada (FOR UPDATE), para contar sin carreras. */
export const findLoginStateForUpdate = async (id, { transaction } = {}) =>
  plain(
    await User.unscoped().findByPk(id, {
      attributes: ['id', 'failedLoginAttempts', 'lockedUntil'],
      transaction,
      lock: Transaction.LOCK.UPDATE,
    })
  );

/** Estado de la cuenta con la fila bloqueada (FOR UPDATE), para las acciones de soporte. */
export const findAccountStateForUpdate = async (id, { transaction } = {}) =>
  plain(
    await User.findByPk(id, {
      attributes: ['id', 'username', 'email', 'isActive', 'mustChangePassword', 'lastLoginAt', 'failedLoginAttempts', 'lockedUntil'],
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

/**
 * Sesiones activas del usuario: un refresh token por dispositivo, sin revocar y sin vencer.
 * Cada renovación crea una fila nueva, así que created_at es la última actividad del dispositivo.
 */
export const listActiveRefreshTokens = async (userId, now = new Date()) =>
  (
    await RefreshToken.findAll({
      where: { userId, revokedAt: null, expiresAt: { [Op.gt]: now } },
      attributes: ['id', 'tokenHash', 'userAgent', 'ipAddress', 'createdAt', 'expiresAt'],
      order: [['createdAt', 'DESC'], ['id', 'DESC']],
    })
  ).map(plain);

export const findRefreshTokenById = async (id, { transaction, lock = false } = {}) =>
  plain(await RefreshToken.findByPk(id, { transaction, lock: lock ? Transaction.LOCK.UPDATE : undefined }));

/** Revoca las sesiones vigentes del usuario salvo `exceptId`. Devuelve cuántas se revocaron. */
export const revokeRefreshTokensExcept = async (userId, exceptId, { transaction } = {}) => {
  const [count] = await RefreshToken.update(
    { revokedAt: new Date() },
    { where: { userId, revokedAt: null, ...(exceptId && { id: { [Op.ne]: exceptId } }) }, transaction }
  );
  return count;
};

/** Revoca todas las sesiones vigentes del usuario. Devuelve cuántas se revocaron. */
export const revokeAllRefreshTokens = async (userId, { transaction } = {}) => {
  const [count] = await RefreshToken.update(
    { revokedAt: new Date() },
    { where: { userId, revokedAt: null }, transaction }
  );
  return count;
};

// --- Tokens de recuperación de contraseña -----------------------------------

export const countResetTokensSince = async (userId, since, { transaction } = {}) =>
  PasswordResetToken.count({ where: { userId, createdAt: { [Op.gte]: since } }, transaction });

/** Invalida el token vigente del usuario (como máximo hay uno, por uq_reset_token_active). */
export const invalidateActiveResetTokens = async (userId, { transaction } = {}) => {
  await PasswordResetToken.update(
    { invalidatedAt: new Date() },
    { where: { userId, usedAt: null, invalidatedAt: null }, transaction }
  );
};

export const createResetToken = async (data, { transaction } = {}) =>
  plain(await PasswordResetToken.create(data, { transaction }));

export const findResetTokenByHash = async (tokenHash, { transaction, lock = false } = {}) =>
  plain(
    await PasswordResetToken.findOne({
      where: { tokenHash },
      transaction,
      lock: lock ? Transaction.LOCK.UPDATE : undefined,
    })
  );

export const findResetTokenById = async (id, { transaction, lock = false } = {}) =>
  plain(await PasswordResetToken.findByPk(id, { transaction, lock: lock ? Transaction.LOCK.UPDATE : undefined }));

export const updateResetToken = async (id, changes, { transaction } = {}) => {
  await PasswordResetToken.update(changes, { where: { id }, transaction });
};
