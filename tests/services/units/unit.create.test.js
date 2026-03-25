import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createUnitService } from '@/services/unit.js';
import { getUnitByIdRepository, createUnitRepository } from '@/repositories/unit.js';

vi.mock('@/repositories/unit.js', () => ({
  getUnitByIdRepository: vi.fn(),
  createUnitRepository: vi.fn()
}));

describe('createUnitService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('crea una unidad correctamente sin unidad base', async () => {
    createUnitRepository.mockResolvedValue({ id: 1 });

    const data = {
      name: 'Kilogramo',
      code: 'Kg',
      is_active: true,
      base_unit_id: null,
      conversion_factor: 1
    };

    const result = await createUnitService(data);

    expect(createUnitRepository).toHaveBeenCalledWith(data);
    expect(result).toEqual({ id: 1 });
  });

  it('lanza error si la unidad base no existe', async () => {
    getUnitByIdRepository.mockResolvedValue(null);

    const data = {
      name: 'Gramo',
      code: 'g',
      is_active: true,
      base_unit_id: 99,
      conversion_factor: 0.001
    };

    await expect(createUnitService(data))
      .rejects.toThrow('La unidad base no existe');
  });

  it('lanza error si la unidad base es derivada', async () => {
    getUnitByIdRepository.mockResolvedValue({
      id: 1,
      base_unit_id: 2
    });

    const data = {
      name: 'Miligramos',
      code: 'mg',
      is_active: true,
      base_unit_id: 1,
      conversion_factor: 0.000001
    };

    await expect(createUnitService(data))
      .rejects.toThrow('La unidad base no puede ser una unidad derivada de otra');
  });
});