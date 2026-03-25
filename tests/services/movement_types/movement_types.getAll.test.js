import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAllMovementTypesService } from '@/services/movement_types.js';
import { getAllMovementTypesRepository } from '@/repositories/movement_types.js';

vi.mock('@/repositories/movement_types.js', () => ({
  getAllMovementTypesRepository: vi.fn()
}));

describe('getAllMovementTypesService', () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna todos los tipos de movimiento', async () => {

    const mockTypes = [
      { id: 1, type: 'ENTRADA' },
      { id: 2, type: 'SALIDA' }
    ];

    getAllMovementTypesRepository.mockResolvedValue(mockTypes);

    const result = await getAllMovementTypesService();

    expect(result).toEqual({
      data: mockTypes
    });

    expect(getAllMovementTypesRepository).toHaveBeenCalled();
  });

});