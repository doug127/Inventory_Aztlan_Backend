// Unitaria del service de auth con el repository simulado (sin BD).
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

vi.mock('#src/modules/auth/auth.repository.js', () => ({
  findUserForLogin: vi.fn(),
  findUserById: vi.fn(),
  findUserWithPasswordById: vi.fn(),
  findLoginStateForUpdate: vi.fn(),
  updateUser: vi.fn(),
  createAuthEvent: vi.fn(),
  createRefreshToken: vi.fn(),
  findRefreshTokenByHash: vi.fn(),
  revokeRefreshToken: vi.fn(),
  revokeAllRefreshTokens: vi.fn(),
}));
vi.mock('#src/shared/db/transaction.js', () => ({ withTransaction: (fn) => fn('tx') }));
vi.mock('#src/modules/email/email.service.js', () => ({ enqueueEmail: vi.fn() }));

const authRepository = await import('#src/modules/auth/auth.repository.js');
const emailService = await import('#src/modules/email/email.service.js');
const { hashToken } = await import('#src/modules/auth/token.service.js');
const { login, refreshSession, resolveSessionUser, getCurrentUser, logout, changePassword } = await import(
  '#src/modules/auth/auth.service.js'
);

const PASSWORD = 'Clave-Correcta-9';
const DAY = 24 * 60 * 60 * 1000;
let passwordHash;

const ROLE = { id: 3, code: 'ALMACENISTA', name: 'Almacenista', hierarchy: 2, isActive: true };
const userRow = (overrides = {}) => ({
  id: 7,
  username: 'pedro.gomez',
  email: 'pedro@aztlan.test',
  fullName: 'Pedro Gómez',
  passwordHash,
  isActive: true,
  mustChangePassword: false,
  passwordChangedAt: new Date('2026-01-01T00:00:00Z'),
  failedLoginAttempts: 0,
  lockedUntil: null,
  lastLoginAt: null,
  role: ROLE,
  ...overrides,
});

const tokenRow = (overrides = {}) => ({
  id: '41',
  userId: 7,
  tokenHash: hashToken('token-vigente'),
  createdAt: new Date(Date.now() - DAY),
  expiresAt: new Date(Date.now() + 6 * DAY),
  revokedAt: null,
  replacedByTokenId: null,
  ...overrides,
});

const expectAppError = async (promise, code) => {
  await expect(promise).rejects.toMatchObject({ name: 'AppError', code });
};

beforeAll(async () => {
  process.env.JWT_SECRET ??= 'secreto-de-pruebas';
  passwordHash = await bcrypt.hash(PASSWORD, 4);
});

beforeEach(() => {
  vi.clearAllMocks();
  authRepository.createRefreshToken.mockImplementation(async (data) => ({ id: '42', ...data }));
  authRepository.findLoginStateForUpdate.mockResolvedValue({ id: 7, failedLoginAttempts: 0, lockedUntil: null });
});

describe('login (HU-101)', () => {
  const ctx = { ip: '10.0.0.5', userAgent: 'vitest' };

  it('con credenciales correctas devuelve el access token y el usuario sin hash', async () => {
    authRepository.findUserForLogin.mockResolvedValue(userRow());

    const { session } = await login({ username: 'pedro.gomez', password: PASSWORD }, ctx);

    expect(session).toMatchObject({ tokenType: 'Bearer', expiresIn: 900 });
    expect(session.user).toMatchObject({ id: 7, username: 'pedro.gomez', role: { code: 'ALMACENISTA', hierarchy: 2 } });
    expect(session.user).not.toHaveProperty('passwordHash');
    expect(session.user.lastLoginAt).toBeInstanceOf(Date);

    const payload = jwt.verify(session.accessToken, process.env.JWT_SECRET);
    expect(payload).toMatchObject({ sub: '7', role_code: 'ALMACENISTA', hierarchy: 2 });
    expect(payload.exp - payload.iat).toBe(900);
  });

  it('registra LOGIN_SUCCESS, actualiza last_login_at y reinicia el contador en la misma transacción', async () => {
    authRepository.findUserForLogin.mockResolvedValue(userRow({ failedLoginAttempts: 3 }));
    await login({ username: 'pedro.gomez', password: PASSWORD }, ctx);

    expect(authRepository.updateUser).toHaveBeenCalledWith(
      7, { lastLoginAt: expect.any(Date), failedLoginAttempts: 0, lockedUntil: null }, { transaction: 'tx' }
    );
    expect(authRepository.createAuthEvent).toHaveBeenCalledWith(
      { userId: 7, usernameAttempted: 'pedro.gomez', eventType: 'LOGIN_SUCCESS', ipAddress: '10.0.0.5', userAgent: 'vitest' },
      { transaction: 'tx' }
    );
  });

  it('contraseña incorrecta: AUTH_INVALID_CREDENTIALS, LOGIN_FAILED y el contador sube', async () => {
    authRepository.findUserForLogin.mockResolvedValue(userRow());
    await expectAppError(login({ username: 'pedro.gomez', password: 'otra' }, ctx), 'AUTH_INVALID_CREDENTIALS');
    expect(authRepository.createAuthEvent).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 7, eventType: 'LOGIN_FAILED' }), { transaction: 'tx' }
    );
    expect(authRepository.updateUser).toHaveBeenCalledWith(7, { failedLoginAttempts: 1, lockedUntil: null }, { transaction: 'tx' });
    expect(authRepository.createRefreshToken).not.toHaveBeenCalled();
  });

  it('usuario inexistente: el mismo error genérico y LOGIN_FAILED sin usuario', async () => {
    authRepository.findUserForLogin.mockResolvedValue(null);
    await expectAppError(login({ username: 'nadie', password: PASSWORD }, ctx), 'AUTH_INVALID_CREDENTIALS');
    expect(authRepository.createAuthEvent).toHaveBeenCalledWith(
      expect.objectContaining({ userId: null, usernameAttempted: 'nadie', eventType: 'LOGIN_FAILED' })
    );
  });

  it('cuenta desactivada con la contraseña correcta: AUTH_ACCOUNT_INACTIVE', async () => {
    authRepository.findUserForLogin.mockResolvedValue(userRow({ isActive: false }));
    await expectAppError(login({ username: 'pedro.gomez', password: PASSWORD }, ctx), 'AUTH_ACCOUNT_INACTIVE');
    expect(authRepository.updateUser).not.toHaveBeenCalled();
  });

  it('cuenta desactivada con la contraseña incorrecta: no revela que está desactivada', async () => {
    authRepository.findUserForLogin.mockResolvedValue(userRow({ isActive: false }));
    await expectAppError(login({ username: 'pedro.gomez', password: 'otra' }, ctx), 'AUTH_INVALID_CREDENTIALS');
  });
});

describe('bloqueo por intentos fallidos (HU-103)', () => {
  const MIN = 60 * 1000;

  it('el quinto fallo bloquea 15 minutos, registra ACCOUNT_LOCKED y encola el correo', async () => {
    authRepository.findUserForLogin.mockResolvedValue(userRow({ failedLoginAttempts: 4 }));
    authRepository.findLoginStateForUpdate.mockResolvedValue({ id: 7, failedLoginAttempts: 4, lockedUntil: null });

    const error = await login({ username: 'pedro.gomez', password: 'otra' }).catch((e) => e);

    expect(error).toMatchObject({ code: 'AUTH_ACCOUNT_LOCKED', status: 423 });
    expect(error.details.retryAfterSeconds).toBe(15 * 60);
    const [, changes] = authRepository.updateUser.mock.calls[0];
    expect(changes.failedLoginAttempts).toBe(5);
    expect(changes.lockedUntil.getTime() - Date.now()).toBeGreaterThan(15 * MIN - 5000);
    expect(authRepository.createAuthEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'ACCOUNT_LOCKED', userId: 7 }), { transaction: 'tx' });
    expect(emailService.enqueueEmail).toHaveBeenCalledWith(
      { userId: 7, toEmail: 'pedro@aztlan.test', template: 'ACCOUNT_LOCKED' }, { transaction: 'tx' }
    );
  });

  it('con menos de 5 fallos no bloquea ni encola correo', async () => {
    authRepository.findUserForLogin.mockResolvedValue(userRow({ failedLoginAttempts: 2 }));
    authRepository.findLoginStateForUpdate.mockResolvedValue({ id: 7, failedLoginAttempts: 2, lockedUntil: null });

    await expectAppError(login({ username: 'pedro.gomez', password: 'otra' }), 'AUTH_INVALID_CREDENTIALS');
    expect(authRepository.updateUser).toHaveBeenCalledWith(7, { failedLoginAttempts: 3, lockedUntil: null }, { transaction: 'tx' });
    expect(emailService.enqueueEmail).not.toHaveBeenCalled();
  });

  it('cuenta bloqueada: rechaza incluso con la contraseña correcta, sin evaluar ni contar', async () => {
    const lockedUntil = new Date(Date.now() + 10 * MIN);
    authRepository.findUserForLogin.mockResolvedValue(userRow({ failedLoginAttempts: 5, lockedUntil }));

    const error = await login({ username: 'pedro.gomez', password: PASSWORD }).catch((e) => e);

    expect(error.code).toBe('AUTH_ACCOUNT_LOCKED');
    expect(error.details.lockedUntil).toBe(lockedUntil.toISOString());
    expect(authRepository.updateUser).not.toHaveBeenCalled();
    expect(authRepository.createRefreshToken).not.toHaveBeenCalled();
    expect(authRepository.createAuthEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'LOGIN_FAILED' }));
  });

  it('bloqueo vencido + contraseña correcta: entra y el contador vuelve a 0', async () => {
    authRepository.findUserForLogin.mockResolvedValue(userRow({ failedLoginAttempts: 5, lockedUntil: new Date(Date.now() - MIN) }));
    const { session } = await login({ username: 'pedro.gomez', password: PASSWORD });
    expect(session.accessToken).toBeTruthy();
    expect(authRepository.updateUser).toHaveBeenCalledWith(7, expect.objectContaining({ failedLoginAttempts: 0, lockedUntil: null }), { transaction: 'tx' });
  });

  it('bloqueo vencido + contraseña incorrecta: el conteo empieza de nuevo en 1', async () => {
    const expired = new Date(Date.now() - MIN);
    authRepository.findUserForLogin.mockResolvedValue(userRow({ failedLoginAttempts: 5, lockedUntil: expired }));
    authRepository.findLoginStateForUpdate.mockResolvedValue({ id: 7, failedLoginAttempts: 5, lockedUntil: expired });

    await expectAppError(login({ username: 'pedro.gomez', password: 'otra' }), 'AUTH_INVALID_CREDENTIALS');
    expect(authRepository.updateUser).toHaveBeenCalledWith(7, { failedLoginAttempts: 1, lockedUntil: null }, { transaction: 'tx' });
  });

  it('si otro intento simultáneo ya bloqueó la cuenta, responde bloqueada sin volver a contar', async () => {
    const lockedUntil = new Date(Date.now() + 15 * MIN);
    authRepository.findUserForLogin.mockResolvedValue(userRow({ failedLoginAttempts: 4 }));
    authRepository.findLoginStateForUpdate.mockResolvedValue({ id: 7, failedLoginAttempts: 5, lockedUntil });

    await expectAppError(login({ username: 'pedro.gomez', password: 'otra' }), 'AUTH_ACCOUNT_LOCKED');
    expect(authRepository.updateUser).not.toHaveBeenCalled();
    expect(emailService.enqueueEmail).not.toHaveBeenCalled();
  });

  it('un usuario inexistente nunca se bloquea (no hay cuenta que contar)', async () => {
    authRepository.findUserForLogin.mockResolvedValue(null);
    await expectAppError(login({ username: 'nadie', password: 'x' }), 'AUTH_INVALID_CREDENTIALS');
    expect(authRepository.findLoginStateForUpdate).not.toHaveBeenCalled();
  });
});

describe('login emite el refresh token (HU-102)', () => {
  it('crea un token de 7 días y guarda solo su hash', async () => {
    authRepository.findUserForLogin.mockResolvedValue(userRow());
    const { refreshToken } = await login({ username: 'pedro.gomez', password: PASSWORD }, { ip: '10.0.0.5' });

    expect(refreshToken.value).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes en base64url
    const saved = authRepository.createRefreshToken.mock.calls[0][0];
    expect(saved).toMatchObject({ userId: 7, tokenHash: hashToken(refreshToken.value), ipAddress: '10.0.0.5' });
    expect(saved).not.toHaveProperty('value');
    expect(saved.tokenHash).not.toBe(refreshToken.value);
    const ttl = new Date(saved.expiresAt).getTime() - Date.now();
    expect(ttl).toBeGreaterThan(7 * DAY - 5000);
    expect(ttl).toBeLessThanOrEqual(7 * DAY);
  });
});

describe('refreshSession (HU-102)', () => {
  it('sin token: AUTH_TOKEN_MISSING', async () => {
    await expectAppError(refreshSession(undefined), 'AUTH_TOKEN_MISSING');
  });

  it('token desconocido: AUTH_TOKEN_INVALID', async () => {
    authRepository.findRefreshTokenByHash.mockResolvedValue(null);
    await expectAppError(refreshSession('no-existe'), 'AUTH_TOKEN_INVALID');
  });

  it('busca por hash con bloqueo de fila', async () => {
    authRepository.findRefreshTokenByHash.mockResolvedValue(null);
    await expectAppError(refreshSession('token-vigente'), 'AUTH_TOKEN_INVALID');
    expect(authRepository.findRefreshTokenByHash).toHaveBeenCalledWith(hashToken('token-vigente'), { transaction: 'tx', lock: true });
  });

  it('token vigente: rota (nuevo token, el anterior revocado y enlazado) y registra TOKEN_REFRESHED', async () => {
    authRepository.findRefreshTokenByHash.mockResolvedValue(tokenRow());
    authRepository.findUserById.mockResolvedValue(userRow());

    const { session, refreshToken } = await refreshSession('token-vigente', { ip: '10.0.0.5' });

    expect(session).toMatchObject({ tokenType: 'Bearer', expiresIn: 900, user: { id: 7 } });
    expect(refreshToken.value).not.toBe('token-vigente');
    expect(authRepository.revokeRefreshToken).toHaveBeenCalledWith(
      '41', { revokedAt: expect.any(Date), replacedByTokenId: '42' }, { transaction: 'tx' }
    );
    expect(authRepository.createAuthEvent).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 7, eventType: 'TOKEN_REFRESHED' }), { transaction: 'tx' }
    );
  });

  it('reuso de un token ya rotado: revoca todas las sesiones del usuario', async () => {
    authRepository.findRefreshTokenByHash.mockResolvedValue(tokenRow({ revokedAt: new Date(), replacedByTokenId: '42' }));
    authRepository.revokeAllRefreshTokens.mockResolvedValue(2);

    await expectAppError(refreshSession('token-vigente'), 'AUTH_TOKEN_INVALID');
    expect(authRepository.revokeAllRefreshTokens).toHaveBeenCalledWith(7, { transaction: 'tx' });
    expect(authRepository.createRefreshToken).not.toHaveBeenCalled();
  });

  it('token revocado por logout (sin reemplazo): AUTH_TOKEN_INVALID sin revocar las demás', async () => {
    authRepository.findRefreshTokenByHash.mockResolvedValue(tokenRow({ revokedAt: new Date() }));
    await expectAppError(refreshSession('token-vigente'), 'AUTH_TOKEN_INVALID');
    expect(authRepository.revokeAllRefreshTokens).not.toHaveBeenCalled();
  });

  it('token vencido: AUTH_TOKEN_EXPIRED', async () => {
    authRepository.findRefreshTokenByHash.mockResolvedValue(tokenRow({ expiresAt: new Date(Date.now() - 1000) }));
    await expectAppError(refreshSession('token-vigente'), 'AUTH_TOKEN_EXPIRED');
    expect(authRepository.createRefreshToken).not.toHaveBeenCalled();
  });

  it('usuario desactivado: revoca el token y responde AUTH_ACCOUNT_INACTIVE', async () => {
    authRepository.findRefreshTokenByHash.mockResolvedValue(tokenRow());
    authRepository.findUserById.mockResolvedValue(userRow({ isActive: false }));

    await expectAppError(refreshSession('token-vigente'), 'AUTH_ACCOUNT_INACTIVE');
    expect(authRepository.revokeRefreshToken).toHaveBeenCalledWith('41', { revokedAt: expect.any(Date) }, { transaction: 'tx' });
    expect(authRepository.createRefreshToken).not.toHaveBeenCalled();
  });

  it('token creado antes del último cambio de contraseña: AUTH_TOKEN_INVALID', async () => {
    authRepository.findRefreshTokenByHash.mockResolvedValue(tokenRow({ createdAt: new Date(Date.now() - 2 * DAY) }));
    authRepository.findUserById.mockResolvedValue(userRow({ passwordChangedAt: new Date(Date.now() - DAY) }));
    await expectAppError(refreshSession('token-vigente'), 'AUTH_TOKEN_INVALID');
  });
});

describe('resolveSessionUser', () => {
  const changedAt = new Date('2026-05-10T12:00:00.750Z');
  const changedAtSeconds = Math.floor(changedAt.getTime() / 1000);

  it('devuelve la identidad de la sesión con datos frescos de la BD', async () => {
    authRepository.findUserById.mockResolvedValue(userRow({ passwordChangedAt: changedAt }));
    await expect(resolveSessionUser({ userId: 7, iat: changedAtSeconds + 60 })).resolves.toEqual({
      id: 7, username: 'pedro.gomez', roleCode: 'ALMACENISTA', hierarchy: 2, mustChangePassword: false,
    });
  });

  it('acepta un token emitido en el mismo segundo del cambio de contraseña', async () => {
    authRepository.findUserById.mockResolvedValue(userRow({ passwordChangedAt: changedAt }));
    await expect(resolveSessionUser({ userId: 7, iat: changedAtSeconds })).resolves.toMatchObject({ id: 7 });
  });

  it('rechaza un token emitido antes del último cambio de contraseña', async () => {
    authRepository.findUserById.mockResolvedValue(userRow({ passwordChangedAt: changedAt }));
    await expectAppError(resolveSessionUser({ userId: 7, iat: changedAtSeconds - 1 }), 'AUTH_TOKEN_INVALID');
  });

  it('usuario inexistente: AUTH_TOKEN_INVALID', async () => {
    authRepository.findUserById.mockResolvedValue(null);
    await expectAppError(resolveSessionUser({ userId: 99, iat: 2_000_000_000 }), 'AUTH_TOKEN_INVALID');
  });

  it('usuario desactivado después del login: AUTH_ACCOUNT_INACTIVE', async () => {
    authRepository.findUserById.mockResolvedValue(userRow({ isActive: false }));
    await expectAppError(resolveSessionUser({ userId: 7, iat: 2_000_000_000 }), 'AUTH_ACCOUNT_INACTIVE');
  });
});

describe('changePassword (HU-104)', () => {
  const actor = { id: 7, username: 'pedro.gomez' };
  const NEW = 'Nueva-Clave-2026';

  beforeEach(() => {
    authRepository.findUserWithPasswordById.mockResolvedValue(userRow({ mustChangePassword: true }));
  });

  it('cambia el hash, quita must_change_password, revoca sesiones, registra el evento y encola el correo', async () => {
    const { session, refreshToken } = await changePassword(actor, { currentPassword: PASSWORD, newPassword: NEW }, { ip: '10.0.0.5' });

    const [id, changes, opts] = authRepository.updateUser.mock.calls[0];
    expect(id).toBe(7);
    expect(opts).toEqual({ transaction: 'tx' });
    expect(changes.mustChangePassword).toBe(false);
    expect(changes.passwordChangedAt).toBeInstanceOf(Date);
    expect(changes.passwordHash).not.toBe(NEW);
    expect(await bcrypt.compare(NEW, changes.passwordHash)).toBe(true);

    expect(authRepository.revokeAllRefreshTokens).toHaveBeenCalledWith(7, { transaction: 'tx' });
    expect(authRepository.createAuthEvent).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 7, eventType: 'PASSWORD_CHANGED', ipAddress: '10.0.0.5' }), { transaction: 'tx' }
    );
    expect(emailService.enqueueEmail).toHaveBeenCalledWith(
      { userId: 7, toEmail: 'pedro@aztlan.test', template: 'PASSWORD_CHANGED' }, { transaction: 'tx' }
    );

    // Sesión nueva para este dispositivo, creada después de revocar las anteriores.
    expect(session.user.mustChangePassword).toBe(false);
    expect(session.accessToken).toBeTruthy();
    expect(refreshToken.value).toBeTruthy();
    const revokeOrder = authRepository.revokeAllRefreshTokens.mock.invocationCallOrder[0];
    const createOrder = authRepository.createRefreshToken.mock.invocationCallOrder[0];
    expect(createOrder).toBeGreaterThan(revokeOrder);
  });

  it('contraseña actual incorrecta: VALIDATION_ERROR en currentPassword y no cambia nada', async () => {
    const error = await changePassword(actor, { currentPassword: 'otra', newPassword: NEW }).catch((e) => e);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details).toEqual([expect.objectContaining({ path: 'currentPassword' })]);
    expect(authRepository.updateUser).not.toHaveBeenCalled();
  });

  it('contraseña nueva que no cumple la política: AUTH_WEAK_PASSWORD con cada regla incumplida', async () => {
    const error = await changePassword(actor, { currentPassword: PASSWORD, newPassword: 'corta' }).catch((e) => e);
    expect(error.code).toBe('AUTH_WEAK_PASSWORD');
    expect(error.details.map((d) => d.message)).toEqual(
      expect.arrayContaining(['La contraseña debe tener al menos 8 caracteres', 'La contraseña debe tener al menos un número'])
    );
    expect(authRepository.updateUser).not.toHaveBeenCalled();
  });

  it('contraseña nueva igual a la actual: AUTH_WEAK_PASSWORD', async () => {
    const error = await changePassword(actor, { currentPassword: PASSWORD, newPassword: PASSWORD }).catch((e) => e);
    expect(error).toMatchObject({ code: 'AUTH_WEAK_PASSWORD', message: 'La contraseña nueva debe ser distinta de la actual' });
    expect(authRepository.updateUser).not.toHaveBeenCalled();
  });
});

describe('getCurrentUser y logout', () => {
  it('getCurrentUser devuelve el DTO del actor', async () => {
    authRepository.findUserById.mockResolvedValue(userRow());
    await expect(getCurrentUser({ id: 7 })).resolves.toMatchObject({ username: 'pedro.gomez', role: { code: 'ALMACENISTA' } });
  });

  it('logout revoca el refresh token del dispositivo y registra LOGOUT', async () => {
    authRepository.findRefreshTokenByHash.mockResolvedValue(tokenRow());
    await logout({ id: 7, username: 'pedro.gomez' }, 'token-vigente', { ip: '10.0.0.5' });
    expect(authRepository.revokeRefreshToken).toHaveBeenCalledWith('41', {}, { transaction: 'tx' });
    expect(authRepository.createAuthEvent).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 7, eventType: 'LOGOUT', ipAddress: '10.0.0.5' }), { transaction: 'tx' }
    );
  });

  it('logout no revoca un refresh token de otro usuario', async () => {
    authRepository.findRefreshTokenByHash.mockResolvedValue(tokenRow({ userId: 99 }));
    await logout({ id: 7, username: 'pedro.gomez' }, 'token-ajeno');
    expect(authRepository.revokeRefreshToken).not.toHaveBeenCalled();
  });
});
