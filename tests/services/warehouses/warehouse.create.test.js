import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createWarehouse } from '@/services/warehouse.js';
import { findWarehouseByName, createWarehouseRepository } from '@/repositories/warehouse.js';

vi.mock('@/repositories/warehouse.js', () => ({
  findWarehouseByName: vi.fn(),
  createWarehouseRepository: vi.fn()
}));

beforeEach(() => vi.clearAllMocks());

describe('createWarehouse service', () => {

  const validData = { name: 'Almacen1', code: 'abcd' };

  it('rechaza usuario sin permisos', async () => {
    await expect(createWarehouse({ data: validData, currentUser: { role: 'user' } }))
      .rejects.toThrow('No tienes permiso para crear almacenes');
  });

  it('rechaza si el almacén ya existe', async () => {
    findWarehouseByName.mockResolvedValue({ id: 1 });
    await expect(createWarehouse({ data: validData, currentUser: { role: 'admin' } }))
      .rejects.toThrow('Ya existe un almacen con ese nombre');
  });

  it('crea almacén correctamente', async () => {
    findWarehouseByName.mockResolvedValue(null);
    createWarehouseRepository.mockResolvedValue({ id: 1, name: 'Almacen1', code: 'ABCD' });

    const result = await createWarehouse({ data: validData, currentUser: { role: 'superadmin' } });

    expect(createWarehouseRepository).toHaveBeenCalledWith({ name: 'Almacen1', code: 'ABCD' });
    expect(result).toEqual({ id: 1, name: 'Almacen1', code: 'ABCD' });
  });

});
