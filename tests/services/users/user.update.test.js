import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcrypt';
import { updateUser } from '@/services/user.js';
import { updateUserRepository } from '@/repositories/user.js';

vi.mock('@/repositories/user.js', () => ({
  updateUserRepository: vi.fn()
}));

vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn(() => 'hashed_password')
  }
}));

beforeEach(() => {
  vi.clearAllMocks();
});


describe('updateUser service', () => {

  it('rechaza usuario sin permisos', async () => {
    await expect(
      updateUser({
        id: 1,
        data: {},
        currentUser: { role: 'user' }
      })
    ).rejects.toThrow('No tienes permiso para actualizar usuarios');
  });

  it('admin actualiza usuario sin cambiar rol', async () => {
    updateUserRepository.mockResolvedValue({ id: 1 });

    const result = await updateUser({
      id: 1,
      data: {
        username: 'Douglas',
        fullname: 'Douglas Tarazone',
        password: 'Password1!'
      },
      currentUser: { role: 'admin' }
    });

    expect(updateUserRepository).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        username: 'douglas',
        fullname: 'DOUGLAS TARAZONE',
        password: expect.any(String) // bcrypt hash
      })
    );

    expect(result.id).toBe(1);
  });

  it('superadmin actualiza usuario con role_id', async () => {
    updateUserRepository.mockResolvedValue({ id: 2, username: 'douglas' });

    const result = await updateUser({
        id: 2,
        data: {
          username: 'Douglas',
          fullname: 'Douglas Tarazone',
          password: 'Password1!',
          role_id: 3
        },
        currentUser: { role: 'superadmin' }
    });

    expect(result.id).toBe(2);
    expect(updateUserRepository).toHaveBeenCalledWith(2, expect.objectContaining({
        username: 'douglas',
        fullname: 'DOUGLAS TARAZONE',
        password: 'hashed_password',
        role_id: 3
    }));
  });

  it('superadmin sin role_id lanza error', async () => {
    await expect(
        updateUser({
        id: 2,
        data: {
            username: 'Douglas',
            fullname: 'Douglas Tarazone',
            password: 'Password1!'
            // role_id faltante
        },
        currentUser: { role: 'superadmin' }
        })
    ).rejects.toThrow('El rol es obligatorio');
  });

  it('admin NO puede modificar el rol del usuario', async () => {
    await expect(
      updateUser({
        id: 1,
        data: {
          role_id: 99
        },
        currentUser: { role: 'admin' }
      })
    ).rejects.toThrow('No tienes permiso para modificar el rol del usuario');
  });
});
