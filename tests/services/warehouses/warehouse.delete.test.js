import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deleteWarehouse } from '@/services/warehouse.js';
import { deleteWarehouseRepository } from '@/repositories/warehouse.js';

vi.mock('@/repositories/warehouse.js', () => ({
  deleteWarehouseRepository: vi.fn()
}));

beforeEach(() => vi.clearAllMocks());

describe('deleteWarehouse service', () => {

  it('rechaza usuario sin permisos', async () => {
    await expect(deleteWarehouse(1, { currentUser: { role: 'user' } }))
      .rejects.toThrow('No tienes permiso para eliminar almacenes');
  });

  it('elimina correctamente', async () => {
    deleteWarehouseRepository.mockResolvedValue(undefined);
    const result = await deleteWarehouse(1, { currentUser: { role: 'admin' } });

    expect(deleteWarehouseRepository).toHaveBeenCalledWith(1);
    expect(result).toBeUndefined();
  });

});
