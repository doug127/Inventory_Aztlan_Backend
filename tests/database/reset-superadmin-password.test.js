// Integración del script de restablecimiento sobre la base de pruebas.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcrypt';
import { sequelize } from '#src/config/database.js';
import { RefreshToken, User } from '#src/database/models/index.model.js';
import { resetSuperadminPassword } from '#src/database/scripts/reset-superadmin-password.js';
import { assertTestDatabase, createTestUser, deleteTestUsers, lastAuthEvent } from '../helpers/db.js';
import { passwordPolicyIssues } from '#src/shared/schemas/password.js';

let target;

beforeAll(async () => {
  assertTestDatabase();
  await deleteTestUsers();
  target = await createTestUser({ name: 'reset', roleCode: 'SUPERADMIN' });
});

afterAll(async () => {
  await deleteTestUsers();
  await sequelize.close();
});

describe('resetSuperadminPassword', () => {
  it('cambia el hash, exige cambio de contraseña, revoca sesiones y registra PASSWORD_CHANGED', async () => {
    await RefreshToken.create({ userId: target.id, tokenHash: 'a'.repeat(64), expiresAt: new Date(Date.now() + 60_000) });
    await User.update({ failedLoginAttempts: 3 }, { where: { id: target.id } });

    const result = await resetSuperadminPassword('Nueva-Clave-2026', { username: target.username });

    expect(result).toMatchObject({ userId: target.id, revokedSessions: 1 });
    const user = await User.unscoped().findByPk(target.id);
    expect(await bcrypt.compare('Nueva-Clave-2026', user.passwordHash)).toBe(true);
    expect(user.mustChangePassword).toBe(true);
    expect(user.failedLoginAttempts).toBe(0);
    expect(user.passwordChangedAt.getTime()).toBeGreaterThan(Date.now() - 10_000);
    expect(await RefreshToken.count({ where: { userId: target.id, revokedAt: null } })).toBe(0);
    expect(await lastAuthEvent({ userId: target.id })).toMatchObject({ eventType: 'PASSWORD_CHANGED' });
  });

  it('rechaza una contraseña que no cumple la política sin tocar nada', async () => {
    const before = (await User.unscoped().findByPk(target.id)).passwordHash;
    await expect(resetSuperadminPassword('corta', { username: target.username })).rejects.toThrow(/política/);
    expect((await User.unscoped().findByPk(target.id)).passwordHash).toBe(before);
  });

  it('falla si no se definió la contraseña o si el usuario no existe', async () => {
    await expect(resetSuperadminPassword(undefined)).rejects.toThrow(/SEED_SUPERADMIN_PASSWORD/);
    await expect(resetSuperadminPassword('Nueva-Clave-2026', { username: 'test.nadie' })).rejects.toThrow(/No existe/);
  });
});

describe('política de contraseñas', () => {
  it.each([
    ['Clave2026', []],
    ['clave2026', ['La contraseña debe tener al menos una letra mayúscula']],
    ['CLAVE2026', ['La contraseña debe tener al menos una letra minúscula']],
    ['ClaveSinNum', ['La contraseña debe tener al menos un número']],
  ])('%s', (password, issues) => {
    expect(passwordPolicyIssues(password)).toEqual(issues);
  });

  it('exige al menos 8 caracteres', () => {
    expect(passwordPolicyIssues('Ab1')).toContain('La contraseña debe tener al menos 8 caracteres');
  });
});
