import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getMovementTypeByIdService } from '@/services/movement_types.js';
import { getMovementTypeByIdRepository } from '@/repositories/movement_types.js';

vi.mock('@/repositories/movement_types.js', () => ({
  getMovementTypeByIdRepository: vi.fn()
}));

describe('getMovementTypeByIdService', () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lanza error si el id es inválido', async () => {
    await expect(
      getMovementTypeByIdService('abc')
    ).rejects.toThrow('ID inválido');
  });

  it('lanza error si no existe el tipo', async () => {

    getMovementTypeByIdRepository.mockResolvedValue(null);

    await expect(
      getMovementTypeByIdService(1)
    ).rejects.toThrow('Tipo de movimiento no encontrado');
  });

  it('retorna el tipo de movimiento', async () => {

    const mockType = { id: 1, type: 'ENTRADA' };

    getMovementTypeByIdRepository.mockResolvedValue(mockType);

    const result = await getMovementTypeByIdService(1);

    expect(result).toEqual({
      data: mockType
    });

  });

});