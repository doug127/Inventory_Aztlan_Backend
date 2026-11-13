import bcrypt from 'bcrypt';
import { AppError } from '#src/shared/errors/AppError.js';
import { withTransaction } from '#src/shared/db/transaction.js';
import { logger } from '#src/shared/logging/logger.js';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  ACCOUNT_LOCK_MS,
  AUTH_EVENT_TYPES,
  BCRYPT_COST,
  MAX_FAILED_LOGIN_ATTEMPTS,
  REFRESH_TOKEN_TTL_MS,
} from '#src/shared/constants/auth.js';
import { EMAIL_TEMPLATES } from '#src/shared/constants/email.js';
import * as emailService from '#src/modules/email/email.service.js';
import * as authRepository from './auth.repository.js';
import { generateOpaqueToken, hashToken, signAccessToken } from './token.service.js';
import { toAuthUserDto, toSessionUser } from './auth.dto.js';

// Hash ficticio para comparar cuando el usuario no existe: así el tiempo de respuesta es el mismo
// y no revela qué nombres de usuario existen. Se calcula al cargar el módulo, no en el primer login,
// para que ni siquiera la primera respuesta a un usuario inexistente tarde más.
const dummyHashPromise = bcrypt.hash('aztlan-usuario-inexistente', BCRYPT_COST);
const getDummyHash = () => dummyHashPromise;

const eventContext = ({ ip, userAgent } = {}) => ({
  ipAddress: ip ?? null,
  userAgent: userAgent ? userAgent.slice(0, 255) : null,
});

/** Cuerpo de respuesta de una sesión iniciada o renovada. */
const buildSession = (user) => ({
  accessToken: signAccessToken(toSessionUser(user)),
  tokenType: 'Bearer',
  expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  user: toAuthUserDto(user),
});

/** Crea un refresh token nuevo. Devuelve el valor en claro (solo para la cookie) y su fila. */
const issueRefreshToken = async (userId, context, { transaction }) => {
  const value = generateOpaqueToken();
  const row = await authRepository.createRefreshToken(
    {
      userId,
      tokenHash: hashToken(value),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      ...eventContext(context),
    },
    { transaction }
  );
  return { value, id: row.id, expiresAt: row.expiresAt };
};

// --- Bloqueo por intentos fallidos (HU-103) ---------------------------------

const isLocked = (state, now) => Boolean(state.lockedUntil) && new Date(state.lockedUntil) > now;

const accountLockedError = (lockedUntil, now) => {
  const until = new Date(lockedUntil);
  return new AppError('AUTH_ACCOUNT_LOCKED', {
    message: 'Cuenta bloqueada temporalmente por intentos fallidos. Intente de nuevo más tarde.',
    details: {
      lockedUntil: until.toISOString(),
      retryAfterSeconds: Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 1000)),
    },
  });
};

/**
 * Suma un intento fallido. Al llegar a MAX_FAILED_LOGIN_ATTEMPTS bloquea la cuenta, registra
 * ACCOUNT_LOCKED y encola el correo, todo en la misma transacción. La fila se lee con FOR UPDATE
 * para que dos intentos simultáneos no cuenten el mismo número.
 * Devuelve { lockedUntil } si la cuenta quedó (o ya estaba) bloqueada; si no, null.
 */
const registerFailedAttempt = (user, event, now) =>
  withTransaction(async (transaction) => {
    const state = await authRepository.findLoginStateForUpdate(user.id, { transaction });
    const failed = { ...event, userId: user.id, eventType: AUTH_EVENT_TYPES.LOGIN_FAILED };

    // Otro intento simultáneo pudo bloquearla mientras se verificaba la contraseña.
    if (isLocked(state, now)) {
      await authRepository.createAuthEvent(failed, { transaction });
      return { lockedUntil: state.lockedUntil };
    }

    // Si hubo un bloqueo y ya venció, el conteo empieza de nuevo.
    const previous = state.lockedUntil ? 0 : state.failedLoginAttempts;
    const attempts = previous + 1;
    const lockedUntil = attempts >= MAX_FAILED_LOGIN_ATTEMPTS ? new Date(now.getTime() + ACCOUNT_LOCK_MS) : null;

    await authRepository.updateUser(user.id, { failedLoginAttempts: attempts, lockedUntil }, { transaction });
    await authRepository.createAuthEvent(failed, { transaction });

    if (!lockedUntil) return null;

    await authRepository.createAuthEvent({ ...event, userId: user.id, eventType: AUTH_EVENT_TYPES.ACCOUNT_LOCKED }, { transaction });
    await emailService.enqueueEmail(
      { userId: user.id, toEmail: user.email, template: EMAIL_TEMPLATES.ACCOUNT_LOCKED },
      { transaction }
    );
    return { lockedUntil };
  });

/**
 * HU-101 + HU-103: inicio de sesión con usuario y contraseña.
 *
 * - El error por credenciales es siempre genérico (business_rules.md §9.4.4). Solo cuando la
 *   contraseña es correcta se informa que la cuenta está desactivada.
 * - Mientras la cuenta está bloqueada ni siquiera se evalúa la contraseña: así un atacante no
 *   puede seguir probando durante el bloqueo.
 * - El quinto fallo consecutivo bloquea la cuenta 15 minutos; un login exitoso reinicia el contador.
 *
 * Devuelve { session, refreshToken }: session va en el cuerpo de la respuesta y refreshToken.value
 * solo en la cookie httpOnly.
 *
 * @param {{ username: string, password: string }} input  username ya normalizado a minúsculas
 * @param {{ ip?: string, userAgent?: string }} context
 */
export const login = async ({ username, password }, context = {}) => {
  const now = new Date();
  const user = await authRepository.findUserForLogin(username);
  const event = { usernameAttempted: username, ...eventContext(context) };

  if (user && isLocked(user, now)) {
    await authRepository.createAuthEvent({ ...event, userId: user.id, eventType: AUTH_EVENT_TYPES.LOGIN_FAILED });
    throw accountLockedError(user.lockedUntil, now);
  }

  const passwordMatches = await bcrypt.compare(password, user?.passwordHash ?? (await getDummyHash()));

  if (!user) {
    await authRepository.createAuthEvent({ ...event, userId: null, eventType: AUTH_EVENT_TYPES.LOGIN_FAILED });
    throw new AppError('AUTH_INVALID_CREDENTIALS');
  }

  if (!passwordMatches) {
    const lock = await registerFailedAttempt(user, event, now);
    if (lock) throw accountLockedError(lock.lockedUntil, now);
    throw new AppError('AUTH_INVALID_CREDENTIALS');
  }

  if (!user.isActive) {
    await authRepository.createAuthEvent({ ...event, userId: user.id, eventType: AUTH_EVENT_TYPES.LOGIN_FAILED });
    throw new AppError('AUTH_ACCOUNT_INACTIVE');
  }

  const lastLoginAt = now;
  const refreshToken = await withTransaction(async (transaction) => {
    await authRepository.updateUser(
      user.id,
      { lastLoginAt, failedLoginAttempts: 0, lockedUntil: null },
      { transaction }
    );
    await authRepository.createAuthEvent(
      { ...event, userId: user.id, eventType: AUTH_EVENT_TYPES.LOGIN_SUCCESS },
      { transaction }
    );
    return issueRefreshToken(user.id, context, { transaction });
  });

  return { session: buildSession({ ...user, lastLoginAt }), refreshToken };
};

/**
 * HU-102: renueva la sesión con el refresh token de la cookie y lo rota.
 *
 * - Token rotado que se vuelve a usar → posible robo: se revocan TODAS las sesiones del usuario.
 * - Token vencido, revocado (logout) o desconocido → se rechaza.
 * - Usuario desactivado → se revoca el token y pierde el acceso (business_rules.md §9.3.5).
 *
 * Las revocaciones de seguridad deben quedar guardadas aunque la petición falle, por eso la
 * transacción devuelve el error en lugar de lanzarlo: un throw dentro haría rollback y desharía
 * la revocación. El error se lanza después del commit.
 */
export const refreshSession = async (rawToken, context = {}) => {
  if (!rawToken) throw new AppError('AUTH_TOKEN_MISSING', { message: 'No hay una sesión que renovar' });

  const now = new Date();
  const outcome = await withTransaction(async (transaction) => {
    const stored = await authRepository.findRefreshTokenByHash(hashToken(rawToken), { transaction, lock: true });
    if (!stored) return { error: 'AUTH_TOKEN_INVALID' };

    if (stored.revokedAt) {
      if (stored.replacedByTokenId) {
        const revoked = await authRepository.revokeAllRefreshTokens(stored.userId, { transaction });
        return { error: 'AUTH_TOKEN_INVALID', reuse: { userId: stored.userId, revoked } };
      }
      return { error: 'AUTH_TOKEN_INVALID' };
    }

    if (new Date(stored.expiresAt) <= now) {
      await authRepository.revokeRefreshToken(stored.id, { revokedAt: now }, { transaction });
      return { error: 'AUTH_TOKEN_EXPIRED' };
    }

    const user = await authRepository.findUserById(stored.userId, { transaction });
    if (!user || !user.isActive) {
      await authRepository.revokeRefreshToken(stored.id, { revokedAt: now }, { transaction });
      return { error: user ? 'AUTH_ACCOUNT_INACTIVE' : 'AUTH_TOKEN_INVALID' };
    }

    // Defensa adicional: cambiar la contraseña revoca los tokens, pero si alguno quedara vigente,
    // no puede ser anterior al cambio.
    if (new Date(stored.createdAt) < new Date(user.passwordChangedAt)) {
      await authRepository.revokeRefreshToken(stored.id, { revokedAt: now }, { transaction });
      return { error: 'AUTH_TOKEN_INVALID' };
    }

    const next = await issueRefreshToken(user.id, context, { transaction });
    await authRepository.revokeRefreshToken(stored.id, { revokedAt: now, replacedByTokenId: next.id }, { transaction });
    await authRepository.createAuthEvent(
      { userId: user.id, usernameAttempted: user.username, eventType: AUTH_EVENT_TYPES.TOKEN_REFRESHED, ...eventContext(context) },
      { transaction }
    );
    return { user, refreshToken: next };
  });

  if (outcome.reuse) {
    logger.warn('AUTH', 'refresh', 'TOKEN_REUSE', { userId: outcome.reuse.userId, revoked: outcome.reuse.revoked, ip: context.ip });
  }
  if (outcome.error) {
    const message = outcome.error === 'AUTH_TOKEN_EXPIRED' ? 'La sesión expiró, inicie sesión de nuevo' : undefined;
    throw new AppError(outcome.error, { message });
  }

  return { session: buildSession(outcome.user), refreshToken: outcome.refreshToken };
};

/**
 * Identidad de la sesión a partir del payload del access token. La usa el middleware auth en cada
 * petición, para que desactivar a un usuario o cambiar su contraseña tenga efecto inmediato.
 */
export const resolveSessionUser = async ({ userId, iat }) => {
  const user = await authRepository.findUserById(userId);
  if (!user) throw new AppError('AUTH_TOKEN_INVALID');
  if (!user.isActive) throw new AppError('AUTH_ACCOUNT_INACTIVE');

  // business_rules.md §9.3.4: un token emitido antes del último cambio de contraseña se rechaza.
  // iat va en segundos, así que se compara contra el segundo del cambio.
  const changedAtSeconds = Math.floor(new Date(user.passwordChangedAt).getTime() / 1000);
  if (!Number.isInteger(iat) || iat < changedAtSeconds) {
    throw new AppError('AUTH_TOKEN_INVALID', { message: 'La sesión ya no es válida, inicie sesión de nuevo' });
  }

  return toSessionUser(user);
};

export const getCurrentUser = async (actor) => {
  const user = await authRepository.findUserById(actor.id);
  if (!user) throw new AppError('AUTH_TOKEN_INVALID');
  return toAuthUserDto(user);
};

/**
 * Cierre de sesión: revoca el refresh token de este dispositivo (si es del usuario) y registra LOGOUT.
 * Las demás sesiones del usuario siguen activas; cerrarlas una a una es HU-109.
 */
export const logout = async (actor, rawRefreshToken, context = {}) => {
  await withTransaction(async (transaction) => {
    if (rawRefreshToken) {
      const stored = await authRepository.findRefreshTokenByHash(hashToken(rawRefreshToken), { transaction });
      if (stored && stored.userId === actor.id && !stored.revokedAt) {
        await authRepository.revokeRefreshToken(stored.id, {}, { transaction });
      }
    }
    await authRepository.createAuthEvent(
      { userId: actor.id, usernameAttempted: actor.username, eventType: AUTH_EVENT_TYPES.LOGOUT, ...eventContext(context) },
      { transaction }
    );
  });
};
