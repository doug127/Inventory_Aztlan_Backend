import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deleteUser } from '@/services/user.js';
import { deleteUserRepository } from '@/repositories/user.js';

vi.mock('@/repositories/user.js', () => ({
  deleteUserRepository: vi.fn()
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('deleteUser service', () => {

  it('elimina el usuario correctamente', async () => {
    deleteUserRepository.mockResolvedValue();

    const result = await deleteUser(1);

    expect(deleteUserRepository).toHaveBeenCalledWith(1);
    expect(result).toBeUndefined();
  });

  it('lanza error si falla el repositorio', async () => {
    deleteUserRepository.mockRejectedValue(
      new Error('Usuario no encontrado')
    );

    await expect(deleteUser(99))
      .rejects
      .toThrow('Error al eliminar usuario: Usuario no encontrado');
  });
});