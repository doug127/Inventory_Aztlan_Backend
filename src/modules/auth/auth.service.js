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
  PASSWORD_RESET_MAX_PER_HOUR,
  PASSWORD_RESET_TOKEN_TTL_MS,
  REFRESH_TOKEN_TTL_MS,
} from '#src/shared/constants/auth.js';
import { EMAIL_TEMPLATES } from '#src/shared/constants/email.js';
import { passwordPolicyIssues } from '#src/shared/schemas/password.js';
import * as emailService from '#src/modules/email/email.service.js';
import * as authRepository from './auth.repository.js';
import { generateOpaqueToken, generateTemporaryPassword, hashToken, signAccessToken } from './token.service.js';
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

const fieldIssue = (path, message) => ({ location: 'body', path, message });

/**
 * HU-104: cambio de contraseña (obligatorio si must_change_password = true).
 *
 * business_rules.md §9.2.3: actualiza password_changed_at (los access tokens anteriores dejan de
 * servir), revoca TODOS los refresh tokens del usuario y encola el correo PASSWORD_CHANGED.
 * Devuelve una sesión nueva solo para este dispositivo, así el usuario no tiene que volver a
 * escribir la contraseña que acaba de crear; los demás dispositivos quedan desconectados.
 */
export const changePassword = async (actor, { currentPassword, newPassword }, context = {}) => {
  const user = await authRepository.findUserWithPasswordById(actor.id);
  if (!user) throw new AppError('AUTH_TOKEN_INVALID');

  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw new AppError('VALIDATION_ERROR', {
      message: 'La contraseña actual no es correcta',
      details: [fieldIssue('currentPassword', 'La contraseña actual no es correcta')],
    });
  }

  const issues = passwordPolicyIssues(newPassword);
  if (issues.length) {
    throw new AppError('AUTH_WEAK_PASSWORD', { details: issues.map((message) => fieldIssue('newPassword', message)) });
  }
  if (await bcrypt.compare(newPassword, user.passwordHash)) {
    const message = 'La contraseña nueva debe ser distinta de la actual';
    throw new AppError('AUTH_WEAK_PASSWORD', { message, details: [fieldIssue('newPassword', message)] });
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
  const passwordChangedAt = new Date();

  const refreshToken = await withTransaction(async (transaction) => {
    await authRepository.updateUser(user.id, { passwordHash, passwordChangedAt, mustChangePassword: false }, { transaction });
    await authRepository.revokeAllRefreshTokens(user.id, { transaction });
    await authRepository.createAuthEvent(
      { userId: user.id, usernameAttempted: user.username, eventType: AUTH_EVENT_TYPES.PASSWORD_CHANGED, ...eventContext(context) },
      { transaction }
    );
    await emailService.enqueueEmail(
      { userId: user.id, toEmail: user.email, template: EMAIL_TEMPLATES.PASSWORD_CHANGED },
      { transaction }
    );
    // Se crea después de revocar, con fecha posterior a password_changed_at.
    return issueRefreshToken(user.id, context, { transaction });
  });

  return {
    session: buildSession({ ...user, passwordChangedAt, mustChangePassword: false }),
    refreshToken,
  };
};

// --- Recuperación de contraseña (HU-105) -------------------------------------
//
// El token en claro NUNCA se guarda: ni en password_reset_tokens (solo su SHA-256) ni en
// email_outbox (que no guarda el cuerpo del correo, db_schema.md §2). Por eso el token se genera
// en el momento de enviar el correo, con prepareResetTokenForDelivery: al solicitar la recuperación
// solo se crea la fila con un hash de relleno que no corresponde a ningún token entregado.

const HOUR_MS = 60 * 60 * 1000;

/**
 * Solicitud de recuperación (business_rules.md §9.5). No devuelve nada: el controller responde
 * siempre lo mismo, exista o no el correo, para no revelar qué cuentas existen.
 * - Usuario inexistente o inactivo: no se crea token ni se envía correo.
 * - Máximo PASSWORD_RESET_MAX_PER_HOUR solicitudes por hora por usuario (el límite por IP va en la ruta).
 * - Una solicitud nueva invalida la anterior: solo hay un token vigente por usuario.
 */
export const requestPasswordReset = async ({ email }, context = {}) => {
  const now = new Date();
  const user = await authRepository.findUserByEmail(email);

  await authRepository.createAuthEvent({
    userId: user?.id ?? null,
    usernameAttempted: email,
    eventType: AUTH_EVENT_TYPES.PASSWORD_RESET_REQUESTED,
    ...eventContext(context),
  });

  if (!user || !user.isActive) return;

  await withTransaction(async (transaction) => {
    // Serializa solicitudes simultáneas del mismo usuario (índice de un solo token vigente).
    await authRepository.lockUser(user.id, { transaction });

    const recent = await authRepository.countResetTokensSince(user.id, new Date(now.getTime() - HOUR_MS), { transaction });
    if (recent >= PASSWORD_RESET_MAX_PER_HOUR) {
      logger.warn('AUTH', 'forgot-password', 'USER_LIMIT', { userId: user.id, recent });
      return;
    }

    await issuePasswordResetEmail(user, { requestedIp: context.ip, now }, { transaction });
  });
};

/**
 * Invalida el token vigente del usuario, crea uno nuevo (con hash de relleno: el token real se
 * genera al enviar) y encola el correo PASSWORD_RESET enlazado. Debe llamarse dentro de una
 * transacción que ya bloqueó la fila del usuario. La usan la solicitud del propio usuario y el
 * restablecimiento forzado por un administrador (HU-108).
 */
const issuePasswordResetEmail = async (user, { requestedIp = null, now = new Date() }, { transaction }) => {
  await authRepository.invalidateActiveResetTokens(user.id, { transaction });
  const resetToken = await authRepository.createResetToken(
    {
      userId: user.id,
      tokenHash: hashToken(generateOpaqueToken()),
      expiresAt: new Date(now.getTime() + PASSWORD_RESET_TOKEN_TTL_MS),
      requestedIp,
    },
    { transaction }
  );
  await emailService.enqueueEmail(
    { userId: user.id, toEmail: user.email, template: EMAIL_TEMPLATES.PASSWORD_RESET, passwordResetTokenId: resetToken.id },
    { transaction }
  );
  return resetToken;
};

/**
 * Genera el token en claro de un correo PASSWORD_RESET en el momento de enviarlo: guarda su hash,
 * fija la vigencia de 30 minutos desde ahora y devuelve el token para armar el enlace del correo.
 * Lo usa el worker de correos (HU-106) y, mientras tanto, el comando de desarrollo
 * `pnpm dev:reset-link`. Si el token ya se usó o fue invalidado devuelve null (no se envía).
 * Cada llamada genera un token nuevo: un reintento de envío deja sin efecto el enlace anterior.
 */
export const prepareResetTokenForDelivery = async (passwordResetTokenId) =>
  withTransaction(async (transaction) => {
    const row = await authRepository.findResetTokenById(passwordResetTokenId, { transaction, lock: true });
    if (!row || row.usedAt || row.invalidatedAt) return null;

    const token = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS);
    await authRepository.updateResetToken(row.id, { tokenHash: hashToken(token), expiresAt }, { transaction });
    return { token, expiresAt, userId: row.userId };
  });

const findActiveResetToken = async (rawToken, options) => {
  const row = await authRepository.findResetTokenByHash(hashToken(rawToken), options);
  if (!row || row.usedAt || row.invalidatedAt || new Date(row.expiresAt) <= new Date()) return null;
  return row;
};

/** Para que la pantalla de restablecimiento sepa, antes de pedir la contraseña, si el enlace sirve. */
export const validateResetToken = async (rawToken) => {
  const row = await findActiveResetToken(rawToken);
  if (!row) throw new AppError('AUTH_RESET_TOKEN_INVALID');
  return { valid: true, expiresAt: new Date(row.expiresAt) };
};

/**
 * Restablece la contraseña con el token del correo (uso único). Al terminar: marca el token como
 * usado, revoca todas las sesiones, quita must_change_password, desbloquea la cuenta, registra
 * PASSWORD_RESET_COMPLETED y encola PASSWORD_CHANGED. No inicia sesión: el usuario entra con su
 * contraseña nueva.
 */
export const resetPassword = async ({ token, newPassword }, context = {}) => {
  const issues = passwordPolicyIssues(newPassword);
  if (issues.length) {
    throw new AppError('AUTH_WEAK_PASSWORD', { details: issues.map((message) => fieldIssue('newPassword', message)) });
  }
  // El hash se calcula antes de abrir la transacción, para no retener el bloqueo durante bcrypt.
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
  const now = new Date();

  const outcome = await withTransaction(async (transaction) => {
    const row = await findActiveResetToken(token, { transaction, lock: true });
    if (!row) return { error: 'AUTH_RESET_TOKEN_INVALID' };

    const user = await authRepository.findUserWithPasswordById(row.userId, { transaction });
    if (!user || !user.isActive) {
      // El enlace de una cuenta desactivada se anula (y la anulación debe quedar guardada).
      await authRepository.updateResetToken(row.id, { invalidatedAt: now }, { transaction });
      return { error: 'AUTH_RESET_TOKEN_INVALID' };
    }
    if (await bcrypt.compare(newPassword, user.passwordHash)) {
      // No se consume el token: el usuario puede intentar con otra contraseña.
      return { error: 'SAME_PASSWORD' };
    }

    await authRepository.updateUser(
      user.id,
      { passwordHash, passwordChangedAt: now, mustChangePassword: false, failedLoginAttempts: 0, lockedUntil: null },
      { transaction }
    );
    await authRepository.updateResetToken(row.id, { usedAt: now }, { transaction });
    await authRepository.revokeAllRefreshTokens(user.id, { transaction });
    await authRepository.createAuthEvent(
      { userId: user.id, usernameAttempted: user.username, eventType: AUTH_EVENT_TYPES.PASSWORD_RESET_COMPLETED, ...eventContext(context) },
      { transaction }
    );
    await emailService.enqueueEmail(
      { userId: user.id, toEmail: user.email, template: EMAIL_TEMPLATES.PASSWORD_CHANGED },
      { transaction }
    );
    return { userId: user.id };
  });

  if (outcome.error === 'SAME_PASSWORD') {
    const message = 'La contraseña nueva debe ser distinta de la actual';
    throw new AppError('AUTH_WEAK_PASSWORD', { message, details: [fieldIssue('newPassword', message)] });
  }
  if (outcome.error) throw new AppError(outcome.error);
};

// --- Soporte de cuentas para la gestión de usuarios (HU-107, HU-108) ---------
//
// Aquí vive todo lo que toca contraseñas, sesiones y tokens; el service de usuarios decide QUIÉN
// puede hacerlo (jerarquía) y llama a estas funciones.

/** Hash de una contraseña aleatoria que nadie conoce: la cuenta no admite login hasta fijar otra. */
export const unusablePasswordHash = () => bcrypt.hash(generateOpaqueToken(), BCRYPT_COST);

/**
 * Genera la contraseña temporal del correo WELCOME en el momento de enviarlo (igual que el token
 * de recuperación): solo queda su hash en la BD y el texto viaja únicamente en el correo.
 * Devuelve null si ya no tiene sentido enviarla: usuario inexistente o inactivo, o que ya fijó
 * su propia contraseña o ya inició sesión. Cada llamada genera una contraseña nueva: un reintento
 * de envío deja sin efecto la anterior.
 */
export const prepareWelcomeForDelivery = async (userId) => {
  // Se calcula antes de abrir la transacción, para no retener el bloqueo durante bcrypt.
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, BCRYPT_COST);

  return withTransaction(async (transaction) => {
    const user = await authRepository.findAccountStateForUpdate(userId, { transaction });
    if (!user || !user.isActive || !user.mustChangePassword || user.lastLoginAt) return null;
    await authRepository.updateUser(user.id, { passwordHash, passwordChangedAt: new Date() }, { transaction });
    return { temporaryPassword };
  });
};

/**
 * HU-108: restablecimiento forzado por un administrador. La contraseña actual deja de servir de
 * inmediato (se reemplaza por una desconocida), se cierran todas las sesiones (los access tokens
 * caen por password_changed_at) y el usuario recibe el correo PASSWORD_RESET para fijar una nueva.
 * Devuelve null si el usuario no existe o está inactivo.
 */
export const forcePasswordReset = async (userId, context = {}) => {
  const passwordHash = await unusablePasswordHash();
  const now = new Date();
  // El iat del JWT va en segundos y resolveSessionUser rechaza iat < password_changed_at (en
  // segundos). Con la hora exacta, un access token emitido en este mismo segundo seguiría sirviendo
  // hasta 15 minutos; al segundo siguiente, ningún token anterior al restablecimiento pasa.
  // Nadie puede iniciar sesión hasta fijar la contraseña nueva, que vuelve a fijar la fecha.
  const passwordChangedAt = new Date((Math.floor(now.getTime() / 1000) + 1) * 1000);

  return withTransaction(async (transaction) => {
    const user = await authRepository.findAccountStateForUpdate(userId, { transaction });
    if (!user || !user.isActive) return null;

    await authRepository.updateUser(user.id, { passwordHash, passwordChangedAt }, { transaction });
    const revokedSessions = await authRepository.revokeAllRefreshTokens(user.id, { transaction });
    const resetToken = await issuePasswordResetEmail(user, { requestedIp: context.ip, now }, { transaction });
    await authRepository.createAuthEvent(
      { userId: user.id, usernameAttempted: user.username, eventType: AUTH_EVENT_TYPES.PASSWORD_RESET_REQUESTED, ...eventContext(context) },
      { transaction }
    );
    return { revokedSessions, expiresAt: new Date(resetToken.expiresAt) };
  });
};

/**
 * HU-108: desbloqueo manual. Reinicia el contador de intentos y quita el bloqueo. Solo registra
 * ACCOUNT_UNLOCKED si la cuenta estaba bloqueada en ese momento. Devuelve { wasLocked } o null si
 * el usuario no existe.
 */
export const unlockAccount = async (userId, context = {}) => {
  const now = new Date();
  return withTransaction(async (transaction) => {
    const user = await authRepository.findAccountStateForUpdate(userId, { transaction });
    if (!user) return null;

    const wasLocked = isLocked(user, now);
    if (!wasLocked && user.failedLoginAttempts === 0 && !user.lockedUntil) return { wasLocked };

    await authRepository.updateUser(user.id, { failedLoginAttempts: 0, lockedUntil: null }, { transaction });
    if (wasLocked) {
      await authRepository.createAuthEvent(
        { userId: user.id, usernameAttempted: user.username, eventType: AUTH_EVENT_TYPES.ACCOUNT_UNLOCKED, ...eventContext(context) },
        { transaction }
      );
    }
    return { wasLocked };
  });
};

/**
 * Al desactivar una cuenta: revoca sus sesiones y anula su enlace de recuperación vigente. Los
 * access tokens ya emitidos caen en la siguiente petición (el middleware auth revisa is_active).
 */
export const revokeAccountAccess = async (userId, { transaction }) => {
  const revokedSessions = await authRepository.revokeAllRefreshTokens(userId, { transaction });
  await authRepository.invalidateActiveResetTokens(userId, { transaction });
  return { revokedSessions };
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
