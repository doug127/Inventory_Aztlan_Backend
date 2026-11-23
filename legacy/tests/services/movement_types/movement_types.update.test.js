import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateMovementTypeService } from '@/services/movement_types.js';
import {
  getMovementTypeByIdRepository,
  updateMovementTypeRepository
} from '@/repositories/movement_types.js';

vi.mock('@/repositories/movement_types.js', () => ({
  getMovementTypeByIdRepository: vi.fn(),
  updateMovementTypeRepository: vi.fn()
}));

describe('updateMovementTypeService', () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lanza error si id inválido', async () => {

    await expect(
      updateMovementTypeService('abc', { type: 'entrada' })
    ).rejects.toThrow('ID inválido');

  });

  it('lanza error si el tipo no existe', async () => {

    getMovementTypeByIdRepository.mockResolvedValue(null);

    await expect(
      updateMovementTypeService(1, { type: 'entrada' })
    ).rejects.toThrow('Tipo de movimiento no encontrado');

  });

  it('actualiza el tipo correctamente', async () => {

    const existing = { id: 1, type: 'ENTRADA' };

    getMovementTypeByIdRepository.mockResolvedValue(existing);

    updateMovementTypeRepository.mockResolvedValue({
      id: 1,
      type: 'SALIDA'
    });

    const result = await updateMovementTypeService(1, {
      type: 'salida'
    });

    expect(result).toEqual({
      data: { id: 1, type: 'SALIDA' }
    });

  });

});