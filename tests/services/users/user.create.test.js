import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcrypt';
import { createUser } from '@/services/user.js';
import { findRoleByName } from '@/repositories/role.js';
import { createUserRepository } from '@/repositories/user.js';

vi.mock('@/repositories/user.js', () => ({
  createUserRepository: vi.fn()
}));

vi.mock('@/repositories/role.js', () => ({
  findRoleByName: vi.fn()
}));

vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn(() => 'hashed_password')
  }
}));


beforeEach(() => {
  vi.clearAllMocks();
});


describe('createUser service', () => {

  it('rechaza usuario sin permisos', async () => {
    await expect(
      createUser({
        data: {},
        currentUser: { role: 'user' }
      })
    ).rejects.toThrow('No tienes permiso');
  });

  it('admin crea usuario con rol user', async () => {
    findRoleByName.mockResolvedValue({ id: 2 });
    createUserRepository.mockResolvedValue({ id: 1 });

    const result = await createUser({
      data: {
        username: 'Douglas',
        fullname: 'Douglas Tarazone',
        password: 'Password1!'
      },
      currentUser: { role: 'admin' }
    });

    expect(findRoleByName).toHaveBeenCalledWith('user');
    expect(createUserRepository).toHaveBeenCalled();
    expect(result.id).toBe(1);
  });

  it('superadmin requiere role_id', async () => {
    await expect(
      createUser({
        data: {
          username: 'Douglas',
          fullname: 'Douglas Tarazone',
          password: 'Password1!'
        },
        currentUser: { role: 'superadmin' }
      })
    ).rejects.toThrow('El rol es obligatorio');
  });

});