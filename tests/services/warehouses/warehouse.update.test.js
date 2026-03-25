import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateWarehouse } from '@/services/warehouse.js';
import { findWarehouseByName, updateWarehouseRepository } from '@/repositories/warehouse.js';

vi.mock('@/repositories/warehouse.js', () => ({
  findWarehouseByName: vi.fn(),
  updateWarehouseRepository: vi.fn()
}));

beforeEach(() => vi.clearAllMocks());

describe('updateWarehouse service', () => {

  const validData = { name: 'Almacen1', code: 'abcd' };

  it('rechaza usuario sin permisos', async () => {
    await expect(updateWarehouse(1, { data: validData, currentUser: { role: 'user' } }))
      .rejects.toThrow('No tienes permiso para actualizar almacenes');
  });

  it('rechaza si el nombre ya existe en otro almacén', async () => {
    findWarehouseByName.mockResolvedValue({ id: 2 });
    await expect(updateWarehouse(1, { data: validData, currentUser: { role: 'admin' } }))
      .rejects.toThrow('Ya existe un almacen con ese nombre');
  });

  it('actualiza almacén correctamente', async () => {
    findWarehouseByName.mockResolvedValue(null);
    updateWarehouseRepository.mockResolvedValue({ id: 1, name: 'Almacen1', code: 'ABCD' });

    const result = await updateWarehouse(1, { data: validData, currentUser: { role: 'superadmin' } });

    expect(updateWarehouseRepository).toHaveBeenCalledWith(1, { name: 'Almacen1', code: 'ABCD' });
    expect(result).toEqual({ id: 1, name: 'Almacen1', code: 'ABCD' });
  });

});
