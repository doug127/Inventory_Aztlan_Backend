// Unitaria de las reglas de productos (business_rules.md §6.4) con los repositories simulados.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('#src/modules/product/product.repository.js', () => ({
  listProducts: vi.fn(),
  findProductById: vi.fn(),
  findTakenFields: vi.fn(),
  findLastSequence: vi.fn(),
  lockCodeSequence: vi.fn(),
  hasMovements: vi.fn(),
  countWarehousesWithStock: vi.fn(),
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
}));
vi.mock('#src/modules/product/product_category/product_category.service.js', () => ({
  assertCategoryAvailable: vi.fn(),
  getSubtreeIds: vi.fn(),
}));
vi.mock('#src/modules/product/unit/unit.service.js', () => ({ assertUnitAvailable: vi.fn() }));
vi.mock('#src/shared/db/transaction.js', () => ({ withTransaction: (fn) => fn('tx') }));

const repo = await import('#src/modules/product/product.repository.js');
const categories = await import('#src/modules/product/product_category/product_category.service.js');
const units = await import('#src/modules/product/unit/unit.service.js');
const service = await import('#src/modules/product/product.service.js');
const { AppError } = await import('#src/shared/errors/AppError.js');

const ref = (id, code, isActive = true) => ({ id, code, name: code, isActive });
const LUBR = ref(2, 'LUBR');
const COMB = ref(1, 'COMB');
const L = ref(1, 'L');
const KG = ref(2, 'KG');
const ACEITE = {
  id: 10,
  code: 'LUBR-0001',
  name: 'Aceite de motor 15W40',
  productCategoryId: 2,
  unitId: 1,
  minStock: '50.000',
  maxStock: '600.000',
  isActive: true,
  category: LUBR,
  unit: L,
  totalStock: '0.000',
  warehousesWithStock: 0,
  hasMovements: false,
  createdAt: new Date('2026-11-01'),
  updatedAt: new Date('2026-11-01'),
};

const input = (overrides = {}) => ({ name: 'Aceite hidráulico', categoryId: 2, unitId: 1, minStock: '0', maxStock: null, ...overrides });

beforeEach(() => {
  vi.clearAllMocks();
  categories.assertCategoryAvailable.mockImplementation(async (id) => ({ 1: COMB, 2: LUBR })[id]);
  units.assertUnitAvailable.mockImplementation(async (id) => ({ 1: L, 2: KG })[id]);
  repo.findProductById.mockResolvedValue(ACEITE);
  repo.findTakenFields.mockResolvedValue({});
  repo.findLastSequence.mockResolvedValue(2);
  repo.hasMovements.mockResolvedValue(false);
  repo.countWarehousesWithStock.mockResolvedValue(0);
  repo.createProduct.mockResolvedValue({ id: 10 });
});

describe('código (regla 1)', () => {
  it('LUBR con LUBR-0002 como último → se sugiere LUBR-0003 (criterio del Módulo 4)', async () => {
    await expect(service.getNextCode({ categoryId: 2 })).resolves.toEqual({ categoryId: 2, categoryCode: 'LUBR', code: 'LUBR-0003' });
    expect(repo.findLastSequence).toHaveBeenCalledWith('LUBR', { transaction: 'tx' });
  });

  it('sin código se asigna el siguiente de la categoría, con el candado de la categoría', async () => {
    await service.createProduct(input());
    expect(repo.lockCodeSequence).toHaveBeenCalledWith(2, { transaction: 'tx' });
    expect(repo.createProduct).toHaveBeenCalledWith(expect.objectContaining({ code: 'LUBR-0003', productCategoryId: 2 }), { transaction: 'tx' });
  });

  it('código con otro prefijo o mal formado → INVALID_CODE_FORMAT', async () => {
    for (const code of ['COMB-0009', 'LUBR-12', 'LUBR0001']) {
      await expect(service.createProduct(input({ code }))).rejects.toMatchObject({
        code: 'INVALID_CODE_FORMAT',
        details: [expect.objectContaining({ path: 'code' })],
      });
    }
    expect(repo.createProduct).not.toHaveBeenCalled();
  });

  it('código o nombre repetidos → DUPLICATE_CODE por campo', async () => {
    repo.findTakenFields.mockResolvedValue({ code: true, name: true });
    await expect(service.createProduct(input({ code: 'LUBR-0001' }))).rejects.toMatchObject({
      code: 'DUPLICATE_CODE',
      details: [expect.objectContaining({ path: 'code' }), expect.objectContaining({ path: 'name' })],
    });
  });

  it('agotados los 9999 códigos de la categoría → VALIDATION_ERROR', async () => {
    repo.findLastSequence.mockResolvedValue(9999);
    await expect(service.createProduct(input())).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('categoría o unidad inactivas: el error de su service se propaga', async () => {
    units.assertUnitAvailable.mockRejectedValueOnce(new AppError('INACTIVE_RESOURCE'));
    await expect(service.createProduct(input())).rejects.toMatchObject({ code: 'INACTIVE_RESOURCE' });
  });
});

describe('mínimo y máximo (regla 2)', () => {
  it('min > max → VALIDATION_ERROR en maxStock; min = max y max null sí se permiten', async () => {
    await expect(service.createProduct(input({ minStock: '10', maxStock: '9.999' }))).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      details: [expect.objectContaining({ path: 'maxStock' })],
    });
    await expect(service.createProduct(input({ minStock: '10', maxStock: '10' }))).resolves.toBeDefined();
    await expect(service.createProduct(input({ minStock: '10', maxStock: null }))).resolves.toBeDefined();
  });

  it('al editar se compara contra el valor guardado: min 700 con max 600 → VALIDATION_ERROR', async () => {
    await expect(service.updateProduct(10, { minStock: '700' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('el mismo valor con otro formato ("50" = "50.000") no escribe nada', async () => {
    await service.updateProduct(10, { minStock: '50', maxStock: 600 });
    expect(repo.updateProduct).not.toHaveBeenCalled();
  });
});

describe('unidad, categoría y código con movimientos (regla 3)', () => {
  it('con movimientos no cambia la unidad → UNIT_CHANGE_FORBIDDEN', async () => {
    repo.hasMovements.mockResolvedValue(true);
    await expect(service.updateProduct(10, { unitId: 2 })).rejects.toMatchObject({
      code: 'UNIT_CHANGE_FORBIDDEN',
      details: [expect.objectContaining({ path: 'unitId' })],
    });
    expect(repo.findProductById).toHaveBeenCalledWith(10, { transaction: 'tx', lock: 'update' });
    expect(repo.updateProduct).not.toHaveBeenCalled();
  });

  it('con movimientos no cambian la categoría ni el código → HAS_DEPENDENCIES; el nombre sí', async () => {
    repo.hasMovements.mockResolvedValue(true);
    await expect(service.updateProduct(10, { categoryId: 1 })).rejects.toMatchObject({ code: 'HAS_DEPENDENCIES' });
    await expect(service.updateProduct(10, { code: 'LUBR-0099' })).rejects.toMatchObject({ code: 'HAS_DEPENDENCIES' });
    await service.updateProduct(10, { name: 'Aceite 15W40 (Shell)' });
    expect(repo.updateProduct).toHaveBeenCalledWith(10, { name: 'Aceite 15W40 (Shell)' }, { transaction: 'tx' });
    expect(repo.hasMovements).toHaveBeenCalledTimes(2);
  });

  it('sin movimientos: cambia la unidad, y al cambiar de categoría recibe el siguiente código de la nueva', async () => {
    repo.findLastSequence.mockResolvedValue(7);
    await service.updateProduct(10, { unitId: 2, categoryId: 1 });
    expect(repo.updateProduct).toHaveBeenCalledWith(10, { unitId: 2, productCategoryId: 1, code: 'COMB-0008' }, { transaction: 'tx' });
  });
});

describe('desactivar y activar (regla 4)', () => {
  it('con existencias → HAS_STOCK, contado con el producto bloqueado', async () => {
    repo.countWarehousesWithStock.mockResolvedValue(2);
    await expect(service.deactivateProduct(10)).rejects.toMatchObject({ code: 'HAS_STOCK', details: { warehousesWithStock: 2 } });
    expect(repo.findProductById).toHaveBeenCalledWith(10, { transaction: 'tx', lock: 'update' });
  });

  it('con stock 0 se desactiva', async () => {
    await service.deactivateProduct(10);
    expect(repo.updateProduct).toHaveBeenCalledWith(10, { isActive: false }, { transaction: 'tx' });
  });

  it('no se reactiva con la categoría o la unidad inactivas', async () => {
    repo.findProductById.mockResolvedValue({ ...ACEITE, isActive: false, unit: ref(1, 'L', false) });
    await expect(service.activateProduct(10)).rejects.toMatchObject({ code: 'INACTIVE_RESOURCE', message: expect.stringContaining('la unidad L') });
  });
});

describe('listProducts y assertProductAvailable', () => {
  it('el filtro de categoría incluye las subcategorías', async () => {
    categories.getSubtreeIds.mockResolvedValue([3, 6, 7, 8]);
    repo.listProducts.mockResolvedValue({ items: [ACEITE], total: 1 });
    const result = await service.listProducts({ page: 1, limit: 20, sort: 'code', order: 'asc', categoryId: 3 });
    expect(repo.listProducts).toHaveBeenCalledWith(expect.objectContaining({ categoryIds: [3, 6, 7, 8] }));
    expect(result.filters).toEqual({ categoryId: 3 });
    expect(result.items[0]).toMatchObject({ code: 'LUBR-0001', minStock: '50.000', stock: { total: '0.000', isEmpty: true } });
  });

  it('assertProductAvailable: inactivo → INACTIVE_RESOURCE; activo → bloqueado FOR SHARE', async () => {
    await expect(service.assertProductAvailable(10, { transaction: 'tx' })).resolves.toMatchObject({ code: 'LUBR-0001' });
    expect(repo.findProductById).toHaveBeenCalledWith(10, { transaction: 'tx', lock: 'share' });
    repo.findProductById.mockResolvedValue({ ...ACEITE, isActive: false });
    await expect(service.assertProductAvailable(10, { transaction: 'tx' })).rejects.toMatchObject({ code: 'INACTIVE_RESOURCE' });
  });
});
