import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deleteUnitService } from '@/services/unit.js';
import {
  getUnitByIdRepository,
  deleteUnitRepository
} from '@/repositories/unit.js';

vi.mock('@/repositories/unit.js', () => ({
  getUnitByIdRepository: vi.fn(),
  deleteUnitRepository: vi.fn()
}));

describe('deleteUnitService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('elimina una unidad activa', async () => {
    getUnitByIdRepository.mockResolvedValue({ id: 1, is_active: true });
    deleteUnitRepository.mockResolvedValue(true);

    const result = await deleteUnitService(1);

    expect(deleteUnitRepository).toHaveBeenCalledWith(1);
    expect(result).toBe(true);
  });

  it('lanza error si la unidad no existe o está inactiva', async () => {
    getUnitByIdRepository.mockResolvedValue(null);

    await expect(deleteUnitService(1))
      .rejects.toThrow('Unidad no encontrada para eliminar');
  });
});
