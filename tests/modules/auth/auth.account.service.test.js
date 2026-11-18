// Unitaria de las funciones de soporte de cuentas (HU-107, HU-108) y de sesiones (HU-109) de
// auth.service, con el repository simulado (sin BD).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcrypt';

vi.mock('#src/modules/auth/auth.repository.js', () => ({
  findAccountStateForUpdate: vi.fn(),
  updateUser: vi.fn(),
  createAuthEvent: vi.fn(),
  revokeAllRefreshTokens: vi.fn(),
  revokeRefreshToken: vi.fn(),
  revokeRefreshTokensExcept: vi.fn(),
  findRefreshTokenById: vi.fn(),
  findRefreshTokenByHash: vi.fn(),
  listActiveRefreshTokens: vi.fn(),
  invalidateActiveResetTokens: vi.fn(),
  createResetToken: vi.fn(),
}));
vi.mock('#src/shared/db/transaction.js', () => ({ withTransaction: (fn) => fn('tx') }));
vi.mock('#src/modules/email/email.service.js', () => ({ enqueueEmail: vi.fn() }));

const repo = await import('#src/modules/auth/auth.repository.js');
const emailService = await import('#src/modules/email/email.service.js');
const { generateTemporaryPassword, hashToken } = await import('#src/modules/auth/token.service.js');
const service = await import('#src/modules/auth/auth.service.js');

const FUTURE = new Date(Date.now() + 60 * 60 * 1000);
const account = (overrides = {}) => ({
  id: 7,
  username: 'pedro.gomez',
  email: 'pedro@aztlan.test',
  isActive: true,
  mustChangePassword: true,
  lastLoginAt: null,
  failedLoginAttempts: 0,
  lockedUntil: null,
  ...overrides,
});
const actor = { id: 7, username: 'pedro.gomez' };
const token = (overrides = {}) => ({ id: '1', userId: 7, tokenHash: 'h1', revokedAt: null, replacedByTokenId: null, expiresAt: FUTURE, ...overrides });

beforeEach(() => {
  vi.clearAllMocks();
  repo.createResetToken.mockResolvedValue({ id: '30', expiresAt: FUTURE });
});

describe('generateTemporaryPassword', () => {
  it('siempre cumple la política y no repite', () => {
    const seen = new Set();
    for (let i = 0; i < 200; i += 1) {
      const password = generateTemporaryPassword();
      expect(password).toMatch(/^(?=.*[A-Z])(?=.*[a-z])(?=.*[2-9])[A-Za-z2-9]{12}$/);
      expect(password).not.toMatch(/[IlO01]/);
      seen.add(password);
    }
    expect(seen.size).toBe(200);
  });
});

describe('prepareWelcomeForDelivery', () => {
  it('genera la contraseña temporal y guarda solo su hash', async () => {
    repo.findAccountStateForUpdate.mockResolvedValue(account());
    const { temporaryPassword } = await service.prepareWelcomeForDelivery(7);

    const [id, changes] = repo.updateUser.mock.calls[0];
    expect(id).toBe(7);
    expect(changes.passwordHash).not.toContain(temporaryPassword);
    expect(await bcrypt.compare(temporaryPassword, changes.passwordHash)).toBe(true);
  });

  it.each([
    ['inactivo', { isActive: false }],
    ['que ya fijó su contraseña', { mustChangePassword: false }],
    ['que ya inició sesión', { lastLoginAt: new Date() }],
  ])('devuelve null para un usuario %s', async (_label, overrides) => {
    repo.findAccountStateForUpdate.mockResolvedValue(account(overrides));
    expect(await service.prepareWelcomeForDelivery(7)).toBeNull();
    expect(repo.updateUser).not.toHaveBeenCalled();
  });
});

describe('forcePasswordReset', () => {
  it('anula la contraseña, revoca sesiones, encola PASSWORD_RESET y registra el evento', async () => {
    repo.findAccountStateForUpdate.mockResolvedValue(account({ mustChangePassword: false }));
    repo.revokeAllRefreshTokens.mockResolvedValue(2);
    const before = Date.now();

    const result = await service.forcePasswordReset(7, { ip: '10.0.0.5' });

    expect(result.revokedSessions).toBe(2);
    const changes = repo.updateUser.mock.calls[0][1];
    // password_changed_at al segundo siguiente: ningún access token de este segundo sobrevive.
    expect(changes.passwordChangedAt.getTime()).toBeGreaterThan(before);
    expect(changes.passwordChangedAt.getMilliseconds()).toBe(0);
    expect(repo.invalidateActiveResetTokens).toHaveBeenCalledWith(7, { transaction: 'tx' });
    expect(emailService.enqueueEmail).toHaveBeenCalledWith(
      expect.objectContaining({ template: 'PASSWORD_RESET', passwordResetTokenId: '30' }),
      { transaction: 'tx' }
    );
    expect(repo.createAuthEvent).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 7, eventType: 'PASSWORD_RESET_REQUESTED', ipAddress: '10.0.0.5' }),
      { transaction: 'tx' }
    );
  });

  it('usuario inactivo → null y no cambia nada', async () => {
    repo.findAccountStateForUpdate.mockResolvedValue(account({ isActive: false }));
    expect(await service.forcePasswordReset(7)).toBeNull();
    expect(repo.updateUser).not.toHaveBeenCalled();
  });
});

describe('unlockAccount', () => {
  it('con bloqueo vigente: reinicia, desbloquea y registra ACCOUNT_UNLOCKED', async () => {
    repo.findAccountStateForUpdate.mockResolvedValue(account({ failedLoginAttempts: 5, lockedUntil: FUTURE }));
    expect(await service.unlockAccount(7)).toEqual({ wasLocked: true });
    expect(repo.updateUser).toHaveBeenCalledWith(7, { failedLoginAttempts: 0, lockedUntil: null }, { transaction: 'tx' });
    expect(repo.createAuthEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'ACCOUNT_UNLOCKED' }), { transaction: 'tx' });
  });

  it('con intentos fallidos pero sin bloqueo: reinicia el contador sin registrar evento', async () => {
    repo.findAccountStateForUpdate.mockResolvedValue(account({ failedLoginAttempts: 3 }));
    expect(await service.unlockAccount(7)).toEqual({ wasLocked: false });
    expect(repo.updateUser).toHaveBeenCalled();
    expect(repo.createAuthEvent).not.toHaveBeenCalled();
  });

  it('sin nada que desbloquear no escribe', async () => {
    repo.findAccountStateForUpdate.mockResolvedValue(account());
    expect(await service.unlockAccount(7)).toEqual({ wasLocked: false });
    expect(repo.updateUser).not.toHaveBeenCalled();
  });
});

describe('sesiones (HU-109)', () => {
  it('listSessions marca la sesión de la cookie y no expone el hash', async () => {
    repo.listActiveRefreshTokens.mockResolvedValue([
      { id: '2', tokenHash: hashToken('cookie-actual'), userAgent: 'Chrome', ipAddress: '10.0.0.5', createdAt: new Date(), expiresAt: FUTURE },
      { id: '1', tokenHash: 'otro', userAgent: null, ipAddress: null, createdAt: new Date(), expiresAt: FUTURE },
    ]);
    const sessions = await service.listSessions(actor, 'cookie-actual');
    expect(sessions.map((s) => [s.id, s.current])).toEqual([['2', true], ['1', false]]);
    expect(sessions[0]).not.toHaveProperty('tokenHash');
  });

  it('revokeSession sigue la cadena de rotación hasta el token vigente', async () => {
    repo.findRefreshTokenById.mockImplementation(async (id) =>
      ({
        1: token({ id: '1', revokedAt: new Date(), replacedByTokenId: '2' }),
        2: token({ id: '2', revokedAt: new Date(), replacedByTokenId: '3' }),
        3: token({ id: '3', tokenHash: 'h3' }),
      })[id]
    );
    expect(await service.revokeSession(actor, '1', null)).toEqual({ current: false });
    expect(repo.revokeRefreshToken).toHaveBeenCalledWith('3', expect.any(Object), { transaction: 'tx' });
    expect(repo.createAuthEvent).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'LOGOUT' }), { transaction: 'tx' });
  });

  it('revokeSession de otro usuario → NOT_FOUND sin revocar', async () => {
    repo.findRefreshTokenById.mockResolvedValue(token({ userId: 99 }));
    await expect(service.revokeSession(actor, '1', null)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(repo.revokeRefreshToken).not.toHaveBeenCalled();
  });

  it('revokeSession de la propia sesión avisa que es la actual', async () => {
    repo.findRefreshTokenById.mockResolvedValue(token({ tokenHash: hashToken('mi-cookie') }));
    expect(await service.revokeSession(actor, '1', 'mi-cookie')).toEqual({ current: true });
  });

  it('revokeOtherSessions conserva la sesión de la cookie', async () => {
    repo.findRefreshTokenByHash.mockResolvedValue(token({ id: '5' }));
    repo.revokeRefreshTokensExcept.mockResolvedValue(3);
    expect(await service.revokeOtherSessions(actor, 'mi-cookie')).toEqual({ revokedSessions: 3, keptCurrent: true });
    expect(repo.revokeRefreshTokensExcept).toHaveBeenCalledWith(7, '5', { transaction: 'tx' });
  });

  it('revokeOtherSessions ignora una cookie de otro usuario', async () => {
    repo.findRefreshTokenByHash.mockResolvedValue(token({ id: '5', userId: 99 }));
    repo.revokeRefreshTokensExcept.mockResolvedValue(1);
    expect((await service.revokeOtherSessions(actor, 'cookie-ajena')).keptCurrent).toBe(false);
    expect(repo.revokeRefreshTokensExcept).toHaveBeenCalledWith(7, null, { transaction: 'tx' });
  });
});
