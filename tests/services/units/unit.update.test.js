import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateUnitService } from '@/services/unit.js';
import {
  getUnitByIdRepository,
  updateUnitRepository
} from '@/repositories/unit.js';

vi.mock('@/repositories/unit.js', () => ({
  getUnitByIdRepository: vi.fn(),
  updateUnitRepository: vi.fn()
}));

describe('updateUnitService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('actualiza la unidad correctamente', async () => {
    getUnitByIdRepository.mockResolvedValue({
      id: 1,
      is_active: true,
      base_unit_id: null
    });

    updateUnitRepository.mockResolvedValue({ id: 1 });

    const result = await updateUnitService(1, {
      name: 'Kilogramo',
      code: 'Kg',
      is_active: true,
      conversion_factor: 1
    });

    expect(updateUnitRepository).toHaveBeenCalled();
    expect(result).toEqual({ id: 1 });
  });

  it('lanza error si la unidad no existe', async () => {
    getUnitByIdRepository.mockResolvedValue(null);

    await expect(
      updateUnitService(1, { name: 'Test', code: 'T', is_active: true, conversion_factor: 1 })
    ).rejects.toThrow('Unidad no encontrada para actualizar');
  });
});
