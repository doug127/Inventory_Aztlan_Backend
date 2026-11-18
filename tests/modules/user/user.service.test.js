// Unitaria de las reglas de jerarquía (business_rules.md §8.3) con repositories simulados.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('#src/modules/user/user.repository.js', () => ({
  findUserById: vi.fn(),
  listUsers: vi.fn(),
  findTakenFields: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  countActiveSuperadmins: vi.fn(),
}));
vi.mock('#src/modules/role/role.repository.js', () => ({
  findRoleByCode: vi.fn(),
  listActiveRoles: vi.fn(),
}));
vi.mock('#src/modules/auth/auth.service.js', () => ({
  unusablePasswordHash: vi.fn(),
  revokeAccountAccess: vi.fn(),
  unlockAccount: vi.fn(),
  forcePasswordReset: vi.fn(),
}));
vi.mock('#src/modules/email/email.service.js', () => ({ enqueueEmail: vi.fn() }));
vi.mock('#src/shared/db/transaction.js', () => ({ withTransaction: (fn) => fn('tx') }));

const userRepo = await import('#src/modules/user/user.repository.js');
const roleRepo = await import('#src/modules/role/role.repository.js');
const authService = await import('#src/modules/auth/auth.service.js');
const emailService = await import('#src/modules/email/email.service.js');
const service = await import('#src/modules/user/user.service.js');

const ROLES = {
  SUPERADMIN: { id: 1, code: 'SUPERADMIN', name: 'Superadministrador', description: null, hierarchy: 0, isActive: true },
  ADMIN: { id: 2, code: 'ADMIN', name: 'Administrador', description: null, hierarchy: 1, isActive: true },
  ALMACENISTA: { id: 3, code: 'ALMACENISTA', name: 'Almacenista', description: null, hierarchy: 2, isActive: true },
  USUARIO: { id: 4, code: 'USUARIO', name: 'Usuario', description: null, hierarchy: 3, isActive: true },
};

const actor = (roleCode, id = 100) => ({ id, username: `actor.${roleCode.toLowerCase()}`, roleCode, hierarchy: ROLES[roleCode].hierarchy });

const user = (roleCode, overrides = {}) => ({
  id: 7,
  username: 'pedro.gomez',
  email: 'pedro@aztlan.test',
  fullName: 'Pedro Gómez',
  role: ROLES[roleCode],
  isActive: true,
  mustChangePassword: false,
  failedLoginAttempts: 0,
  lockedUntil: null,
  lastLoginAt: null,
  createdAt: new Date('2026-11-01'),
  updatedAt: new Date('2026-11-01'),
  ...overrides,
});

const ADMIN = actor('ADMIN');
const SUPER = actor('SUPERADMIN');

beforeEach(() => {
  vi.clearAllMocks();
  roleRepo.findRoleByCode.mockImplementation(async (code) => ROLES[code] ?? null);
  roleRepo.listActiveRoles.mockResolvedValue(Object.values(ROLES));
  userRepo.findTakenFields.mockResolvedValue({});
  userRepo.countActiveSuperadmins.mockResolvedValue(2);
  authService.unusablePasswordHash.mockResolvedValue('$2b$hash');
});

describe('createUser', () => {
  const input = { username: 'nuevo.user', fullName: 'Nuevo Usuario', email: 'nuevo@aztlan.test', roleCode: 'ALMACENISTA' };

  beforeEach(() => {
    userRepo.createUser.mockResolvedValue({ id: 50 });
    userRepo.findUserById.mockResolvedValue(user('ALMACENISTA', { id: 50, username: 'nuevo.user', mustChangePassword: true }));
  });

  it('crea con must_change_password, contraseña desconocida y encola WELCOME en la misma transacción', async () => {
    const dto = await service.createUser(ADMIN, input);

    expect(userRepo.createUser).toHaveBeenCalledWith(
      { username: 'nuevo.user', fullName: 'Nuevo Usuario', email: 'nuevo@aztlan.test', roleId: 3, passwordHash: '$2b$hash', mustChangePassword: true },
      { transaction: 'tx' }
    );
    expect(emailService.enqueueEmail).toHaveBeenCalledWith(
      { userId: 50, toEmail: 'nuevo@aztlan.test', template: 'WELCOME' },
      { transaction: 'tx' }
    );
    expect(dto).toMatchObject({ id: 50, mustChangePassword: true, role: { code: 'ALMACENISTA' } });
    expect(dto).not.toHaveProperty('passwordHash');
  });

  it('un ADMIN no puede crear un ADMIN → FORBIDDEN_HIERARCHY', async () => {
    await expect(service.createUser(ADMIN, { ...input, roleCode: 'ADMIN' })).rejects.toMatchObject({ code: 'FORBIDDEN_HIERARCHY' });
    expect(userRepo.createUser).not.toHaveBeenCalled();
  });

  it('un ADMIN no puede crear un SUPERADMIN', async () => {
    await expect(service.createUser(ADMIN, { ...input, roleCode: 'SUPERADMIN' })).rejects.toMatchObject({ code: 'FORBIDDEN_HIERARCHY' });
  });

  it('el SUPERADMIN puede crear cualquier rol, incluso otro SUPERADMIN', async () => {
    await service.createUser(SUPER, { ...input, roleCode: 'SUPERADMIN' });
    expect(userRepo.createUser).toHaveBeenCalledWith(expect.objectContaining({ roleId: 1 }), { transaction: 'tx' });
  });

  it('username o correo repetido → DUPLICATE_CODE con el detalle por campo', async () => {
    userRepo.findTakenFields.mockResolvedValue({ username: true, email: true });
    const error = await service.createUser(ADMIN, input).catch((e) => e);
    expect(error.code).toBe('DUPLICATE_CODE');
    expect(error.details.map((d) => d.path)).toEqual(['username', 'email']);
  });

  it('rol desactivado → INACTIVE_RESOURCE', async () => {
    roleRepo.findRoleByCode.mockResolvedValue({ ...ROLES.USUARIO, isActive: false });
    await expect(service.createUser(ADMIN, { ...input, roleCode: 'USUARIO' })).rejects.toMatchObject({ code: 'INACTIVE_RESOURCE' });
  });
});

describe('updateUser', () => {
  it('un ADMIN edita a un ALMACENISTA y le cambia el rol a USUARIO', async () => {
    userRepo.findUserById.mockResolvedValue(user('ALMACENISTA'));
    await service.updateUser(ADMIN, 7, { fullName: 'Pedro G.', roleCode: 'USUARIO' });
    expect(userRepo.updateUser).toHaveBeenCalledWith(7, { fullName: 'Pedro G.', roleId: 4 }, { transaction: 'tx' });
  });

  it('un ADMIN no puede editar a otro ADMIN', async () => {
    userRepo.findUserById.mockResolvedValue(user('ADMIN'));
    await expect(service.updateUser(ADMIN, 7, { fullName: 'X Y' })).rejects.toMatchObject({ code: 'FORBIDDEN_HIERARCHY' });
  });

  it('un ADMIN no puede ascender a un ALMACENISTA a ADMIN', async () => {
    userRepo.findUserById.mockResolvedValue(user('ALMACENISTA'));
    await expect(service.updateUser(ADMIN, 7, { roleCode: 'ADMIN' })).rejects.toMatchObject({ code: 'FORBIDDEN_HIERARCHY' });
    expect(userRepo.updateUser).not.toHaveBeenCalled();
  });

  it('nadie cambia su propio rol (ni el SUPERADMIN)', async () => {
    userRepo.findUserById.mockResolvedValue(user('SUPERADMIN', { id: SUPER.id }));
    await expect(service.updateUser(SUPER, SUPER.id, { roleCode: 'ADMIN' })).rejects.toMatchObject({
      code: 'FORBIDDEN_HIERARCHY',
      message: 'No puede cambiar su propio rol',
    });
  });

  it('el único SUPERADMIN que intenta degradarse recibe LAST_SUPERADMIN', async () => {
    userRepo.findUserById.mockResolvedValue(user('SUPERADMIN', { id: SUPER.id }));
    userRepo.countActiveSuperadmins.mockResolvedValue(1);
    await expect(service.updateUser(SUPER, SUPER.id, { roleCode: 'ADMIN' })).rejects.toMatchObject({ code: 'LAST_SUPERADMIN' });
  });

  it('el SUPERADMIN no puede degradar al último SUPERADMIN activo (verificado con bloqueo)', async () => {
    userRepo.findUserById.mockResolvedValue(user('SUPERADMIN'));
    userRepo.countActiveSuperadmins.mockResolvedValue(1);
    await expect(service.updateUser(SUPER, 7, { roleCode: 'ADMIN' })).rejects.toMatchObject({ code: 'LAST_SUPERADMIN' });
    expect(userRepo.countActiveSuperadmins).toHaveBeenCalledWith({ transaction: 'tx', lock: true });
    expect(userRepo.updateUser).not.toHaveBeenCalled();
  });

  it('sin cambios reales no escribe', async () => {
    userRepo.findUserById.mockResolvedValue(user('ALMACENISTA'));
    await service.updateUser(ADMIN, 7, { fullName: 'Pedro Gómez', roleCode: 'ALMACENISTA' });
    expect(userRepo.updateUser).not.toHaveBeenCalled();
  });

  it('el correo nuevo no puede estar en uso por otro usuario', async () => {
    userRepo.findUserById.mockResolvedValue(user('ALMACENISTA'));
    userRepo.findTakenFields.mockResolvedValue({ email: true });
    await expect(service.updateUser(ADMIN, 7, { email: 'otro@aztlan.test' })).rejects.toMatchObject({ code: 'DUPLICATE_CODE' });
    expect(userRepo.findTakenFields).toHaveBeenCalledWith({ username: undefined, email: 'otro@aztlan.test' }, { excludeId: 7 });
  });

  it('usuario inexistente → NOT_FOUND', async () => {
    userRepo.findUserById.mockResolvedValue(null);
    await expect(service.updateUser(ADMIN, 999, { fullName: 'X Y' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('deactivateUser', () => {
  it('desactiva y revoca sesiones y enlaces de recuperación en la misma transacción', async () => {
    userRepo.findUserById.mockResolvedValue(user('USUARIO'));
    await service.deactivateUser(ADMIN, 7);
    expect(userRepo.updateUser).toHaveBeenCalledWith(7, { isActive: false }, { transaction: 'tx' });
    expect(authService.revokeAccountAccess).toHaveBeenCalledWith(7, { transaction: 'tx' });
  });

  it('nadie se desactiva a sí mismo', async () => {
    userRepo.findUserById.mockResolvedValue(user('ADMIN', { id: ADMIN.id }));
    await expect(service.deactivateUser(ADMIN, ADMIN.id)).rejects.toMatchObject({ code: 'FORBIDDEN_HIERARCHY' });
  });

  it('el único SUPERADMIN activo → LAST_SUPERADMIN (criterio del Módulo 3)', async () => {
    userRepo.findUserById.mockResolvedValue(user('SUPERADMIN', { id: SUPER.id }));
    userRepo.countActiveSuperadmins.mockResolvedValue(1);
    await expect(service.deactivateUser(SUPER, SUPER.id)).rejects.toMatchObject({ code: 'LAST_SUPERADMIN' });
  });

  it('un ADMIN no puede desactivar a un SUPERADMIN', async () => {
    userRepo.findUserById.mockResolvedValue(user('SUPERADMIN'));
    await expect(service.deactivateUser(ADMIN, 7)).rejects.toMatchObject({ code: 'FORBIDDEN_HIERARCHY' });
  });

  it('ya inactivo: no hace nada', async () => {
    userRepo.findUserById.mockResolvedValue(user('USUARIO', { isActive: false }));
    const dto = await service.deactivateUser(ADMIN, 7);
    expect(dto.isActive).toBe(false);
    expect(userRepo.updateUser).not.toHaveBeenCalled();
  });
});

describe('listUsers y listAssignableRoles', () => {
  it('un ADMIN solo ve usuarios de rango inferior', async () => {
    userRepo.listUsers.mockResolvedValue({ items: [user('USUARIO')], total: 1 });
    const result = await service.listUsers(ADMIN, { page: 1, limit: 20, sort: 'username', order: 'asc', isActive: true });
    expect(userRepo.listUsers).toHaveBeenCalledWith(expect.objectContaining({ minHierarchyExclusive: 1 }));
    expect(result).toMatchObject({ total: 1, page: 1, limit: 20, filters: { isActive: true }, sort: { field: 'username', order: 'asc' } });
  });

  it('el SUPERADMIN ve a todos', async () => {
    userRepo.listUsers.mockResolvedValue({ items: [], total: 0 });
    await service.listUsers(SUPER, { page: 1, limit: 20, sort: 'username', order: 'asc' });
    expect(userRepo.listUsers).toHaveBeenCalledWith(expect.objectContaining({ minHierarchyExclusive: null }));
  });

  it('roles asignables: ADMIN → ALMACENISTA y USUARIO; SUPERADMIN → todos', async () => {
    expect((await service.listAssignableRoles(ADMIN)).map((r) => r.code)).toEqual(['ALMACENISTA', 'USUARIO']);
    expect((await service.listAssignableRoles(SUPER)).map((r) => r.code)).toEqual(['SUPERADMIN', 'ADMIN', 'ALMACENISTA', 'USUARIO']);
  });

  it('un ADMIN no puede ver la ficha de otro ADMIN, pero sí la suya', async () => {
    userRepo.findUserById.mockResolvedValue(user('ADMIN'));
    await expect(service.getUser(ADMIN, 7)).rejects.toMatchObject({ code: 'FORBIDDEN_HIERARCHY' });
    userRepo.findUserById.mockResolvedValue(user('ADMIN', { id: ADMIN.id }));
    await expect(service.getUser(ADMIN, ADMIN.id)).resolves.toMatchObject({ id: ADMIN.id });
  });
});

describe('HU-108: unlockUser y forcePasswordReset', () => {
  it('desbloquea a un usuario de rango inferior', async () => {
    userRepo.findUserById.mockResolvedValue(user('ALMACENISTA'));
    authService.unlockAccount.mockResolvedValue({ wasLocked: true });
    const result = await service.unlockUser(ADMIN, 7, { ip: '10.0.0.5' });
    expect(authService.unlockAccount).toHaveBeenCalledWith(7, { ip: '10.0.0.5' });
    expect(result.wasLocked).toBe(true);
  });

  it('un ADMIN no desbloquea a otro ADMIN', async () => {
    userRepo.findUserById.mockResolvedValue(user('ADMIN'));
    await expect(service.unlockUser(ADMIN, 7)).rejects.toMatchObject({ code: 'FORBIDDEN_HIERARCHY' });
    expect(authService.unlockAccount).not.toHaveBeenCalled();
  });

  it('fuerza el restablecimiento de un usuario de rango inferior', async () => {
    userRepo.findUserById.mockResolvedValue(user('USUARIO'));
    authService.forcePasswordReset.mockResolvedValue({ revokedSessions: 2, expiresAt: new Date() });
    const result = await service.forcePasswordReset(ADMIN, 7, { ip: '10.0.0.5' });
    expect(authService.forcePasswordReset).toHaveBeenCalledWith(7, { ip: '10.0.0.5' });
    expect(result.revokedSessions).toBe(2);
  });

  it('no se fuerza el restablecimiento de un usuario inactivo', async () => {
    userRepo.findUserById.mockResolvedValue(user('USUARIO', { isActive: false }));
    await expect(service.forcePasswordReset(ADMIN, 7)).rejects.toMatchObject({ code: 'INACTIVE_RESOURCE' });
  });

  it('ni sobre uno mismo ni sobre alguien de igual rango', async () => {
    userRepo.findUserById.mockResolvedValue(user('ADMIN', { id: ADMIN.id }));
    await expect(service.forcePasswordReset(ADMIN, ADMIN.id)).rejects.toMatchObject({ code: 'FORBIDDEN_HIERARCHY' });
    userRepo.findUserById.mockResolvedValue(user('ADMIN'));
    await expect(service.forcePasswordReset(ADMIN, 7)).rejects.toMatchObject({ code: 'FORBIDDEN_HIERARCHY' });
    expect(authService.forcePasswordReset).not.toHaveBeenCalled();
  });
});

describe('toUserDto: estado de conexión', async () => {
  const { toUserDto } = await import('#src/modules/user/user.dto.js');
  const now = new Date('2026-11-17T12:00:00Z');
  const minutesAgo = (m) => new Date(now.getTime() - m * 60_000);

  it.each([
    [0, null, 'OFFLINE'],
    [1, minutesAgo(5), 'ONLINE'],
    [2, minutesAgo(45), 'IDLE'],
  ])('%i sesiones, última actividad %s → %s', (active, lastActivityAt, status) => {
    expect(toUserDto(user('USUARIO', { activeSessions: active, lastActivityAt }), now).sessions.status).toBe(status);
  });
});
