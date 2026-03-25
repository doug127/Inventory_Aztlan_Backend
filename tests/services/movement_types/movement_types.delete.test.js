import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deleteMovementTypeService } from '@/services/movement_types.js';
import {
  getMovementTypeByIdRepository,
  deleteMovementTypeRepository
} from '@/repositories/movement_types.js';

vi.mock('@/repositories/movement_types.js', () => ({
  getMovementTypeByIdRepository: vi.fn(),
  deleteMovementTypeRepository: vi.fn()
}));

describe('deleteMovementTypeService', () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lanza error si id inválido', async () => {

    await expect(
      deleteMovementTypeService('abc')
    ).rejects.toThrow('ID inválido');

  });

  it('lanza error si el tipo no existe', async () => {

    getMovementTypeByIdRepository.mockResolvedValue(null);

    await expect(
      deleteMovementTypeService(1)
    ).rejects.toThrow('Tipo de movimiento no encontrado');

  });

  it('elimina correctamente el tipo', async () => {

    const existing = { id: 1, type: 'ENTRADA' };

    getMovementTypeByIdRepository.mockResolvedValue(existing);
    deleteMovementTypeRepository.mockResolvedValue(true);

    const result = await deleteMovementTypeService(1);

    expect(deleteMovementTypeRepository).toHaveBeenCalledWith(existing);
    expect(result).toBe(true);

  });

});