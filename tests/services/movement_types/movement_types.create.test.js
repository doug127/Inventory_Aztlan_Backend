import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMovementTypeService } from '@/services/movement_types.js';
import { createMovementTypeRepository } from '@/repositories/movement_types.js';

vi.mock('@/repositories/movement_types.js', () => ({
  createMovementTypeRepository: vi.fn()
}));

describe('createMovementTypeService', () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('crea un tipo de movimiento correctamente', async () => {

    createMovementTypeRepository.mockResolvedValue({
      id: 1,
      type: 'ENTRADA'
    });

    const result = await createMovementTypeService({
      type: 'entrada'
    });

    expect(createMovementTypeRepository).toHaveBeenCalledWith({
      type: 'ENTRADA'
    });

    expect(result).toEqual({
      data: { id: 1, type: 'ENTRADA' }
    });

  });

});