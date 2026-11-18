// Unitaria de las reglas de almacenes (business_rules.md §6.1) con el repository simulado.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('#src/modules/warehouse/warehouse.repository.js', () => ({
  listWarehouses: vi.fn(),
  findWarehouseById: vi.fn(),
  findTakenFields: vi.fn(),
  createWarehouse: vi.fn(),
  updateWarehouse: vi.fn(),
  countProductsWithStock: vi.fn(),
  hasMovements: vi.fn(),
}));
vi.mock('#src/shared/db/transaction.js', () => ({ withTransaction: (fn) => fn('tx') }));

const repo = await import('#src/modules/warehouse/warehouse.repository.js');
const service = await import('#src/modules/warehouse/warehouse.service.js');

const warehouse = (overrides = {}) => ({
  id: 3,
  code: 'COMB',
  name: 'Almacén de Combustibles',
  isActive: true,
  productsWithStock: 0,
  createdAt: new Date('2026-11-01'),
  updatedAt: new Date('2026-11-01'),
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  repo.findTakenFields.mockResolvedValue({});
  repo.findWarehouseById.mockResolvedValue(warehouse());
  repo.hasMovements.mockResolvedValue(false);
  repo.countProductsWithStock.mockResolvedValue(0);
});

describe('createWarehouse', () => {
  it('crea con código y nombre válidos', async () => {
    repo.createWarehouse.mockResolvedValue({ id: 3 });
    const dto = await service.createWarehouse({ code: 'COMB', name: 'Almacén de Combustibles' });
    expect(repo.createWarehouse).toHaveBeenCalledWith({ code: 'COMB', name: 'Almacén de Combustibles' });
    expect(dto).toMatchObject({ code: 'COMB', isActive: true, stock: { productsWithStock: 0, isEmpty: true } });
  });

  it.each(['COM', 'COMBU', 'CO-1', 'CÑMB'])('código %s → INVALID_CODE_FORMAT (regla 1)', async (code) => {
    await expect(service.createWarehouse({ code, name: 'Almacén X' })).rejects.toMatchObject({ code: 'INVALID_CODE_FORMAT' });
    expect(repo.createWarehouse).not.toHaveBeenCalled();
  });

  it('código o nombre repetido → DUPLICATE_CODE por campo', async () => {
    repo.findTakenFields.mockResolvedValue({ code: true, name: true });
    const error = await service.createWarehouse({ code: 'COMB', name: 'Almacén de Combustibles' }).catch((e) => e);
    expect(error.code).toBe('DUPLICATE_CODE');
    expect(error.details.map((d) => d.path)).toEqual(['code', 'name']);
  });
});

describe('updateWarehouse', () => {
  it('el nombre se corrige siempre, aunque tenga movimientos', async () => {
    repo.hasMovements.mockResolvedValue(true);
    await service.updateWarehouse(3, { name: 'Combustibles y Lubricantes' });
    expect(repo.updateWarehouse).toHaveBeenCalledWith(3, { name: 'Combustibles y Lubricantes' });
  });

  it('el código no se cambia si el almacén tiene movimientos → HAS_DEPENDENCIES', async () => {
    repo.hasMovements.mockResolvedValue(true);
    await expect(service.updateWarehouse(3, { code: 'LUBR' })).rejects.toMatchObject({ code: 'HAS_DEPENDENCIES' });
    expect(repo.updateWarehouse).not.toHaveBeenCalled();
  });

  it('sin movimientos el código sí se cambia', async () => {
    await service.updateWarehouse(3, { code: 'LUBR' });
    expect(repo.updateWarehouse).toHaveBeenCalledWith(3, { code: 'LUBR' });
  });

  it('sin cambios reales no escribe', async () => {
    await service.updateWarehouse(3, { code: 'COMB', name: 'Almacén de Combustibles' });
    expect(repo.updateWarehouse).not.toHaveBeenCalled();
  });

  it('inexistente → NOT_FOUND', async () => {
    repo.findWarehouseById.mockResolvedValue(null);
    await expect(service.updateWarehouse(99, { name: 'Otro nombre' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('deactivateWarehouse (regla 2)', () => {
  it('con stock → HAS_STOCK y no desactiva', async () => {
    repo.countProductsWithStock.mockResolvedValue(2);
    const error = await service.deactivateWarehouse(3).catch((e) => e);
    expect(error).toMatchObject({ code: 'HAS_STOCK', details: { warehouseCode: 'COMB', productsWithStock: 2 } });
    expect(repo.updateWarehouse).not.toHaveBeenCalled();
  });

  it('con stock 0 bloquea la fila, cuenta y desactiva en la misma transacción', async () => {
    await service.deactivateWarehouse(3);
    expect(repo.findWarehouseById).toHaveBeenCalledWith(3, { transaction: 'tx', lock: 'update' });
    expect(repo.countProductsWithStock).toHaveBeenCalledWith(3, { transaction: 'tx' });
    expect(repo.updateWarehouse).toHaveBeenCalledWith(3, { isActive: false }, { transaction: 'tx' });
  });

  it('ya inactivo: no hace nada', async () => {
    repo.findWarehouseById.mockResolvedValue(warehouse({ isActive: false }));
    await service.deactivateWarehouse(3);
    expect(repo.countProductsWithStock).not.toHaveBeenCalled();
  });
});

describe('assertWarehouseAvailable (regla 3, para movimientos)', () => {
  it('almacén activo: lo devuelve bloqueado FOR SHARE', async () => {
    await expect(service.assertWarehouseAvailable(3, { transaction: 'tx' })).resolves.toMatchObject({ code: 'COMB' });
    expect(repo.findWarehouseById).toHaveBeenCalledWith(3, { transaction: 'tx', lock: 'share' });
  });

  it('almacén inactivo → INACTIVE_RESOURCE', async () => {
    repo.findWarehouseById.mockResolvedValue(warehouse({ isActive: false }));
    await expect(service.assertWarehouseAvailable(3, { role: 'destino' })).rejects.toMatchObject({
      code: 'INACTIVE_RESOURCE',
      message: expect.stringContaining('destino'),
    });
  });

  it('inexistente → NOT_FOUND', async () => {
    repo.findWarehouseById.mockResolvedValue(null);
    await expect(service.assertWarehouseAvailable(99)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
