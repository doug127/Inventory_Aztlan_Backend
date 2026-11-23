// Unitaria de las reglas de activos (business_rules.md §6.5) con el repository y la categoría simulados.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '#src/shared/errors/AppError.js';

vi.mock('#src/modules/asset/asset.repository.js', () => ({
  listAssets: vi.fn(),
  listAssetGroups: vi.fn(),
  findAssetConsumption: vi.fn(),
  findAssetActivity: vi.fn(),
  listAssetHistory: vi.fn(),
  findAssetById: vi.fn(),
  findTakenFields: vi.fn(),
  findCategoryPrefix: vi.fn(),
  findLastNumber: vi.fn(),
  lockCodeSequence: vi.fn(),
  hasMovements: vi.fn(),
  findPendingLoans: vi.fn(),
  createAsset: vi.fn(),
  updateAsset: vi.fn(),
}));
vi.mock('#src/modules/asset/asset_category/asset_category.service.js', () => ({
  assertLeafCategoryAvailable: vi.fn(),
  getSubtreeIds: vi.fn(),
}));
vi.mock('#src/shared/db/transaction.js', () => ({ withTransaction: (fn) => fn('tx') }));

const repo = await import('#src/modules/asset/asset.repository.js');
const categories = await import('#src/modules/asset/asset_category/asset_category.service.js');
const service = await import('#src/modules/asset/asset.service.js');

const dates = { createdAt: new Date('2026-11-01'), updatedAt: new Date('2026-11-01') };
const TRACTOR = { id: 3, code: 'TRACTOR', name: 'Tractor', isActive: true };
const CAMION = { id: 4, code: 'CAMION', name: 'Camión', isActive: true };
const asset = (overrides = {}) => ({
  id: 1,
  code: 'T-01',
  name: 'John Deere 6110',
  assetCategoryId: 3,
  category: TRACTOR,
  categoryPath: [{ id: 1, code: 'VEHICULOS', name: 'Vehículos' }, { id: 3, code: 'TRACTOR', name: 'Tractor' }],
  rootIcon: 'tractor',
  isActive: true,
  hasMovements: false,
  pendingLoans: 0,
  ...dates,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  repo.findAssetById.mockResolvedValue(asset());
  repo.findTakenFields.mockResolvedValue({});
  repo.findCategoryPrefix.mockResolvedValue('T');
  repo.findLastNumber.mockResolvedValue({ last: 2, width: 2 });
  repo.hasMovements.mockResolvedValue(false);
  repo.findPendingLoans.mockResolvedValue([]);
  repo.createAsset.mockResolvedValue({ id: 9 });
  categories.assertLeafCategoryAvailable.mockImplementation(async (id) => ({ 3: TRACTOR, 4: CAMION })[id]);
});

describe('getNextCode', () => {
  it('TRACTOR con T-02 como último sugiere T-03; TB-200 sugiere TB-201', async () => {
    expect(await service.getNextCode({ categoryId: 3 })).toEqual({ categoryId: 3, categoryCode: 'TRACTOR', prefix: 'T', code: 'T-03' });
    repo.findCategoryPrefix.mockResolvedValue('TB');
    repo.findLastNumber.mockResolvedValue({ last: 200, width: 3 });
    expect((await service.getNextCode({ categoryId: 3 })).code).toBe('TB-201');
  });

  it('identificadores no numéricos (PE-TAL) o categoría sin activos: sin sugerencia', async () => {
    repo.findLastNumber.mockResolvedValue({ last: null, width: 3 });
    expect(await service.getNextCode({ categoryId: 3 })).toMatchObject({ prefix: 'T', code: null });
    repo.findCategoryPrefix.mockResolvedValue(null);
    expect(await service.getNextCode({ categoryId: 3 })).toMatchObject({ prefix: null, code: null });
  });

  it('categoría con subcategorías → el error de la categoría (CATEGORY_NOT_LEAF)', async () => {
    categories.assertLeafCategoryAvailable.mockRejectedValue(new AppError('CATEGORY_NOT_LEAF'));
    await expect(service.getNextCode({ categoryId: 1 })).rejects.toMatchObject({ code: 'CATEGORY_NOT_LEAF' });
  });
});

describe('createAsset', () => {
  it('sin código asigna el siguiente del prefijo, con el candado del prefijo', async () => {
    await service.createAsset({ name: 'Landini 120', categoryId: 3 });
    expect(categories.assertLeafCategoryAvailable).toHaveBeenCalledWith(3, { transaction: 'tx' });
    expect(repo.lockCodeSequence).toHaveBeenCalledWith('T', { transaction: 'tx' });
    expect(repo.createAsset).toHaveBeenCalledWith({ code: 'T-03', name: 'Landini 120', assetCategoryId: 3 }, { transaction: 'tx' });
  });

  it('sin código y sin correlativo posible → VALIDATION_ERROR en code', async () => {
    repo.findCategoryPrefix.mockResolvedValue(null);
    await expect(service.createAsset({ name: 'Nuevo', categoryId: 3 })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      details: [expect.objectContaining({ path: 'code' })],
    });
    expect(repo.createAsset).not.toHaveBeenCalled();
  });

  it('código fuera de formato → INVALID_CODE_FORMAT', async () => {
    for (const code of ['T01', 'TRACT-01', 'T-', 'T-123456', '1-01', 'T-0_1']) {
      await expect(service.createAsset({ code, name: 'X', categoryId: 3 })).rejects.toMatchObject({ code: 'INVALID_CODE_FORMAT' });
    }
  });

  it('código o nombre repetido → DUPLICATE_CODE por campo; el nombre se compara en la categoría', async () => {
    repo.findTakenFields.mockResolvedValue({ code: true, name: true });
    const error = await service.createAsset({ code: 'T-01', name: 'John Deere 6110', categoryId: 3 }).catch((e) => e);
    expect(error.code).toBe('DUPLICATE_CODE');
    expect(error.details.map((d) => d.path)).toEqual(['code', 'name']);
    expect(repo.findTakenFields).toHaveBeenCalledWith({ code: 'T-01', name: 'John Deere 6110', categoryId: 3 }, { transaction: 'tx' });
  });
});

describe('updateAsset', () => {
  it('con movimientos no cambia el código → HAS_DEPENDENCIES', async () => {
    repo.hasMovements.mockResolvedValue(true);
    await expect(service.updateAsset(1, { code: 'T-09' })).rejects.toMatchObject({ code: 'HAS_DEPENDENCIES' });
    expect(repo.findAssetById).toHaveBeenCalledWith(1, { transaction: 'tx', lock: 'update' });
    expect(repo.updateAsset).not.toHaveBeenCalled();
  });

  it('con movimientos sí cambian el nombre y la categoría (a otra hoja activa)', async () => {
    repo.hasMovements.mockResolvedValue(true);
    await service.updateAsset(1, { name: 'John Deere 6110 M', categoryId: 4 });
    expect(categories.assertLeafCategoryAvailable).toHaveBeenCalledWith(4, { transaction: 'tx' });
    expect(repo.findTakenFields).toHaveBeenCalledWith({ code: undefined, name: 'John Deere 6110 M', categoryId: 4 }, { excludeId: 1, transaction: 'tx' });
    expect(repo.updateAsset).toHaveBeenCalledWith(1, { name: 'John Deere 6110 M', assetCategoryId: 4 }, { transaction: 'tx' });
  });

  it('sin cambios reales no abre transacción ni escribe', async () => {
    await service.updateAsset(1, { name: 'John Deere 6110', code: 'T-01', categoryId: 3 });
    expect(repo.updateAsset).not.toHaveBeenCalled();
  });
});

describe('deactivate / activate', () => {
  it('con préstamos pendientes → HAS_DEPENDENCIES con el detalle (regla 4)', async () => {
    repo.findPendingLoans.mockResolvedValue([{ code: 'HERR-0001', name: 'Llave', unitCode: 'UND', pending: '2.000' }]);
    const error = await service.deactivateAsset(1).catch((e) => e);
    expect(error.code).toBe('HAS_DEPENDENCIES');
    expect(error.message).toContain('HERR-0001 (2 UND)');
    expect(repo.findAssetById).toHaveBeenCalledWith(1, { transaction: 'tx', lock: 'update' });
  });

  it('sin préstamos pendientes se desactiva', async () => {
    await service.deactivateAsset(1);
    expect(repo.updateAsset).toHaveBeenCalledWith(1, { isActive: false }, { transaction: 'tx' });
  });

  it('no se reactiva con la categoría inactiva', async () => {
    repo.findAssetById.mockResolvedValue(asset({ isActive: false, category: { ...TRACTOR, isActive: false } }));
    await expect(service.activateAsset(1)).rejects.toMatchObject({ code: 'INACTIVE_RESOURCE' });
  });
});

describe('assertAssetAvailable (para movimientos, HU-401)', () => {
  it('inexistente → NOT_FOUND; inactivo → INACTIVE_RESOURCE; activo → bloqueado FOR SHARE', async () => {
    repo.findAssetById.mockResolvedValueOnce(null);
    await expect(service.assertAssetAvailable(99, { transaction: 'tx' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    repo.findAssetById.mockResolvedValueOnce(asset({ isActive: false }));
    await expect(service.assertAssetAvailable(1, { transaction: 'tx' })).rejects.toMatchObject({ code: 'INACTIVE_RESOURCE' });
    await expect(service.assertAssetAvailable(1, { transaction: 'tx' })).resolves.toMatchObject({ code: 'T-01' });
    expect(repo.findAssetById).toHaveBeenLastCalledWith(1, { transaction: 'tx', lock: 'share' });
  });
});

describe('DTO', () => {
  it('trae la ruta de la categoría y el icono de su raíz', async () => {
    const dto = await service.getAsset(1);
    expect(dto.category).toMatchObject({ code: 'TRACTOR', displayIcon: 'tractor' });
    expect(dto.category.path.map((c) => c.code)).toEqual(['VEHICULOS', 'TRACTOR']);
  });
});

describe('listAssetGroups (lotes con sus tablones)', () => {
  it('resuelve la rama, agrupa por categoría hoja y devuelve el rango de códigos', async () => {
    categories.getSubtreeIds.mockResolvedValue([4, 5, 8]);
    repo.listAssetGroups.mockResolvedValue({
      items: [
        {
          id: 5,
          code: 'LOTE_1',
          name: 'Lote 1',
          isActive: true,
          path: [{ id: 4, code: 'CAMPO', name: 'Campo' }, { id: 5, code: 'LOTE_1', name: 'Lote 1' }],
          rootIcon: 'wheat',
          assets: 40,
          active: 39,
          firstCode: 'TB-100',
          lastCode: 'TB-139',
          totalGroups: 20,
        },
      ],
      total: 20,
    });
    const result = await service.listAssetGroups({ page: 1, limit: 50, categoryId: 4, isActive: true });
    expect(repo.listAssetGroups).toHaveBeenCalledWith(expect.objectContaining({ categoryIds: [4, 5, 8], isActive: true }));
    expect(result.total).toBe(20);
    expect(result.filters).toEqual({ isActive: true, categoryId: 4 });
    expect(result.items[0]).toEqual({
      category: { id: 5, code: 'LOTE_1', name: 'Lote 1', isActive: true, path: expect.any(Array), displayIcon: 'wheat' },
      assets: 40,
      active: 39,
      firstCode: 'TB-100',
      lastCode: 'TB-139',
    });
  });

  it('sin categoría no resuelve rama: agrupa toda la finca', async () => {
    repo.listAssetGroups.mockResolvedValue({ items: [], total: 0 });
    await service.listAssetGroups({ page: 1, limit: 50 });
    expect(categories.getSubtreeIds).not.toHaveBeenCalled();
    expect(repo.listAssetGroups).toHaveBeenCalledWith(expect.objectContaining({ categoryIds: undefined }));
  });
});

describe('Ficha del activo (HU-304)', () => {
  const T01 = () => asset({ id: 1, code: 'T-01', name: 'John Deere 6110' });

  it('consumo neto = consumido − corregido con decimal.js, ordenado de mayor a menor y con 3 decimales', async () => {
    repo.findAssetById.mockResolvedValue(T01());
    repo.findAssetConsumption.mockResolvedValue([
      { id: 10, code: 'COMB-0001', name: 'Diésel', unitCode: 'L', consumed: '0.3', corrected: '0.1', lines: 2, lastConsumedAt: null },
      { id: 11, code: 'LUBR-0001', name: 'Aceite 15W40', unitCode: 'L', consumed: '350', corrected: '50', lines: 3, lastConsumedAt: '2026-11-02T12:00:00Z' },
    ]);
    repo.findPendingLoans.mockResolvedValue([{ code: 'HERR-0001', name: 'Gato', unitCode: 'UND', pending: '2.000' }]);
    repo.findAssetActivity.mockResolvedValue({ lines: 5, firstMovementAt: '2026-10-05T12:00:00Z', lastMovementAt: '2026-11-07T12:00:00Z' });

    const sheet = await service.getAssetConsumption(1, { from: new Date('2026-10-01') });
    expect(repo.findAssetConsumption).toHaveBeenCalledWith(1, { from: new Date('2026-10-01'), to: undefined });
    // 0.3 − 0.1 da 0.19999… con números de JavaScript; con decimal.js, 0.200.
    expect(sheet.consumption.map((c) => [c.product.code, c.consumed, c.corrected, c.net])).toEqual([
      ['LUBR-0001', '350.000', '50.000', '300.000'],
      ['COMB-0001', '0.300', '0.100', '0.200'],
    ]);
    expect(sheet.pendingLoans).toEqual([{ product: { code: 'HERR-0001', name: 'Gato', unitCode: 'UND' }, pending: '2.000' }]);
    expect(sheet.activity.lastMovementAt).toEqual(new Date('2026-11-07T12:00:00Z'));
  });

  it('historial: + en CONSUMO, − en CORRECCION, 0 en préstamos y devoluciones', async () => {
    repo.findAssetById.mockResolvedValue(T01());
    const line = (id, kind, quantity) => ({
      id,
      kind,
      quantity,
      lineNote: null,
      movementId: id,
      documentNumber: `RET-00000${id}`,
      movementType: 'OUT',
      reason: kind,
      reference: null,
      movementDate: '2026-11-02T12:00:00Z',
      receivedBy: null,
      warehouse: { id: 1, code: 'COMB', name: 'Combustible' },
      createdBy: { id: 1, fullName: 'Admin' },
      product: { id: 10, code: 'COMB-0001', name: 'Diésel', unitCode: 'L' },
    });
    repo.listAssetHistory.mockResolvedValue({ items: [line(1, 'CONSUMO', '150.000'), line(2, 'CORRECCION', '50.000'), line(3, 'PRESTAMO', '3.000')], total: 3 });

    const result = await service.listAssetHistory(1, { page: 1, limit: 20, kind: ['CONSUMO', 'CORRECCION', 'PRESTAMO'] });
    expect(repo.listAssetHistory).toHaveBeenCalledWith(1, expect.objectContaining({ kinds: ['CONSUMO', 'CORRECCION', 'PRESTAMO'] }));
    expect(result.items.map((l) => l.consumptionEffect)).toEqual(['150.000', '-50.000', '0.000']);
    expect(result.filters).toEqual({ kind: ['CONSUMO', 'CORRECCION', 'PRESTAMO'] });
  });

  it('activo inexistente → NOT_FOUND sin consultar movimientos', async () => {
    repo.findAssetById.mockResolvedValue(null);
    await expect(service.getAssetConsumption(99)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(service.listAssetHistory(99, { page: 1, limit: 20 })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(repo.findAssetConsumption).not.toHaveBeenCalled();
    expect(repo.listAssetHistory).not.toHaveBeenCalled();
  });
});
