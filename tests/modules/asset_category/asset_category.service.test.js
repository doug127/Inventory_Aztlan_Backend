// Unitaria de las reglas de categorías de activos (business_rules.md §6.2) con el repository simulado.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('#src/modules/asset/asset_category/asset_category.repository.js', () => ({
  listCategories: vi.fn(),
  findAllCategories: vi.fn(),
  findCategoryById: vi.fn(),
  findChildren: vi.fn(),
  findAncestors: vi.fn(),
  findSubtreeIds: vi.fn(),
  findTakenFields: vi.fn(),
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  countDependencies: vi.fn(),
  lockTreeForMove: vi.fn(),
  findCategoryByCode: vi.fn(),
  findChildCategories: vi.fn(),
  countAssetsInSubtrees: vi.fn(),
}));
vi.mock('#src/shared/db/transaction.js', () => ({ withTransaction: (fn) => fn('tx') }));

const repo = await import('#src/modules/asset/asset_category/asset_category.repository.js');
const service = await import('#src/modules/asset/asset_category/asset_category.service.js');

const dates = { createdAt: new Date('2026-11-01'), updatedAt: new Date('2026-11-01') };
const ref = (c) => ({ id: c.id, code: c.code, name: c.name, isActive: c.isActive });
const cat = (id, code, name, parent = null, overrides = {}) => ({
  id,
  code,
  name,
  parentId: parent?.id ?? null,
  parent: parent ? ref(parent) : null,
  icon: null,
  isActive: true,
  activeChildren: 0,
  totalChildren: 0,
  activeAssets: 0,
  totalAssets: 0,
  ...dates,
  ...overrides,
});

// VEHICULOS › MAQUINARIA_AGRICOLA › TRACTOR (2 activos); CAMPO › LOTE_1 (2 tablones); PERSONAL (3).
const VEHICULOS = cat(1, 'VEHICULOS', 'Vehículos', null, { icon: 'tractor', totalChildren: 1, activeChildren: 1 });
const MAQUINARIA = cat(2, 'MAQUINARIA_AGRICOLA', 'Maquinaria agrícola', VEHICULOS, { totalChildren: 1, activeChildren: 1 });
const TRACTOR = cat(3, 'TRACTOR', 'Tractor', MAQUINARIA, { totalAssets: 2, activeAssets: 2 });
const CAMPO = cat(4, 'CAMPO', 'Campo', null, { icon: 'wheat', totalChildren: 1, activeChildren: 1 });
const LOTE_1 = cat(5, 'LOTE_1', 'Lote 1', CAMPO, { totalAssets: 2, activeAssets: 2 });
const PERSONAL = cat(6, 'PERSONAL', 'Personal', null, { icon: 'users', totalAssets: 3, activeAssets: 3 });
const VIEJA = cat(7, 'VIEJA', 'Inactiva', null, { isActive: false });
const ALL = { 1: VEHICULOS, 2: MAQUINARIA, 3: TRACTOR, 4: CAMPO, 5: LOTE_1, 6: PERSONAL, 7: VIEJA };
const SUBTREES = { 1: [1, 2, 3], 2: [2, 3], 3: [3], 4: [4, 5], 5: [5], 6: [6], 7: [7] };
const usageOf = (id) => {
  const c = ALL[id];
  return { activeChildren: c.activeChildren, totalChildren: c.totalChildren, activeAssets: c.activeAssets, totalAssets: c.totalAssets };
};

beforeEach(() => {
  vi.clearAllMocks();
  repo.findCategoryById.mockImplementation(async (id) => ALL[id] ?? null);
  repo.findSubtreeIds.mockImplementation(async (id) => SUBTREES[id] ?? []);
  repo.findTakenFields.mockResolvedValue({});
  repo.countDependencies.mockImplementation(async (id) => usageOf(id));
  repo.createCategory.mockResolvedValue({ id: 3 });
});

describe('getCategoryTree', () => {
  it('arma el árbol con los activos de toda la rama y el icono de la raíz en cada nivel', async () => {
    repo.findAllCategories.mockResolvedValue(Object.values(ALL));
    const tree = await service.getCategoryTree();
    const vehiculos = tree.find((n) => n.code === 'VEHICULOS');
    expect(vehiculos).toMatchObject({ depth: 0, icon: 'tractor', displayIcon: 'tractor', assetsInSubtree: 2, isLeaf: false });
    const tractor = vehiculos.children[0].children[0];
    expect(tractor).toMatchObject({ code: 'TRACTOR', depth: 2, icon: null, displayIcon: 'tractor', isLeaf: true, acceptsChildren: false });
    expect(tree.find((n) => n.code === 'PERSONAL')).toMatchObject({ isLeaf: true, assetsInSubtree: 3 });
  });

  it('con isActive=true omite las ramas inactivas', async () => {
    repo.findAllCategories.mockResolvedValue(Object.values(ALL));
    expect((await service.getCategoryTree({ isActive: true })).map((n) => n.code)).not.toContain('VIEJA');
  });
});

describe('createCategory', () => {
  it('crea una raíz con icono', async () => {
    await service.createCategory({ code: 'GANADO', name: 'Ganado', parentId: null, icon: 'beef' });
    expect(repo.createCategory).toHaveBeenCalledWith({ code: 'GANADO', name: 'Ganado', parentId: null, icon: 'beef' }, { transaction: 'tx' });
  });

  it('crea una subcategoría bajo un padre sin activos, bloqueado FOR UPDATE', async () => {
    await service.createCategory({ code: 'LOTE_3', name: 'Lote 3', parentId: 4, icon: null });
    expect(repo.findCategoryById).toHaveBeenCalledWith(4, { transaction: 'tx', lock: 'update' });
    expect(repo.createCategory).toHaveBeenCalledWith({ code: 'LOTE_3', name: 'Lote 3', parentId: 4, icon: null }, { transaction: 'tx' });
  });

  it('LOTE_1 con tablones no admite subcategorías → CATEGORY_HAS_ASSETS (Módulo 5)', async () => {
    await expect(service.createCategory({ code: 'SECTOR_A', name: 'Sector A', parentId: 5, icon: null })).rejects.toMatchObject({
      code: 'CATEGORY_HAS_ASSETS',
      details: [expect.objectContaining({ path: 'parentId' })],
    });
    expect(repo.createCategory).not.toHaveBeenCalled();
  });

  it('una subcategoría con icono → VALIDATION_ERROR en icon', async () => {
    await expect(service.createCategory({ code: 'LOTE_3', name: 'Lote 3', parentId: 4, icon: 'sprout' })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      details: [expect.objectContaining({ path: 'icon' })],
    });
  });

  it('código fuera de formato → INVALID_CODE_FORMAT', async () => {
    for (const code of ['L', '1LOTE', 'LOTE-3', 'LOTE 3', 'A'.repeat(21)]) {
      await expect(service.createCategory({ code, name: 'X', parentId: null, icon: null })).rejects.toMatchObject({ code: 'INVALID_CODE_FORMAT' });
    }
  });

  it('nombre o código repetido → DUPLICATE_CODE por campo', async () => {
    repo.findTakenFields.mockResolvedValue({ code: true, name: true });
    const error = await service.createCategory({ code: 'TRACTOR', name: 'Tractor', parentId: 2, icon: null }).catch((e) => e);
    expect(error.code).toBe('DUPLICATE_CODE');
    expect(error.details.map((d) => d.path)).toEqual(['code', 'name']);
  });

  it('padre inexistente → VALIDATION_ERROR; padre inactivo → INACTIVE_RESOURCE', async () => {
    await expect(service.createCategory({ code: 'XX', name: 'X', parentId: 99, icon: null })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(service.createCategory({ code: 'XX', name: 'X', parentId: 7, icon: null })).rejects.toMatchObject({ code: 'INACTIVE_RESOURCE' });
  });
});

describe('updateCategory: mover', () => {
  it('mover VEHICULOS dentro de su nieta TRACTOR → CATEGORY_CYCLE, sin escribir', async () => {
    await expect(service.updateCategory(1, { parentId: 3 })).rejects.toMatchObject({ code: 'CATEGORY_CYCLE' });
    expect(repo.lockTreeForMove).toHaveBeenCalled();
    expect(repo.updateCategory).not.toHaveBeenCalled();
  });

  it('mover bajo una categoría con activos → CATEGORY_HAS_ASSETS', async () => {
    await expect(service.updateCategory(2, { parentId: 6 })).rejects.toMatchObject({ code: 'CATEGORY_HAS_ASSETS' });
  });

  it('una raíz movida dentro de otra pierde su icono', async () => {
    await service.updateCategory(6, { parentId: 4 });
    expect(repo.updateCategory).toHaveBeenCalledWith(6, { parentId: 4, icon: null }, { transaction: 'tx' });
  });

  it('volverla raíz permite elegirle icono, sin validar ciclos', async () => {
    await service.updateCategory(5, { parentId: null, icon: 'land-plot' });
    expect(repo.findSubtreeIds).not.toHaveBeenCalled();
    expect(repo.updateCategory).toHaveBeenCalledWith(5, { parentId: null, icon: 'land-plot' }, { transaction: 'tx' });
  });

  it('icono a una subcategoría que sigue siéndolo → VALIDATION_ERROR', async () => {
    await expect(service.updateCategory(3, { icon: 'tractor' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('el código se corrige aunque tenga activos; sin cambios reales no escribe', async () => {
    await service.updateCategory(3, { code: 'TRACTORES' });
    expect(repo.updateCategory).toHaveBeenCalledWith(3, { code: 'TRACTORES' }, { transaction: 'tx' });
    repo.updateCategory.mockClear();
    await service.updateCategory(1, { name: 'Vehículos', icon: 'tractor' });
    expect(repo.updateCategory).not.toHaveBeenCalled();
  });
});

describe('deactivate / activate (regla 3)', () => {
  it('con subcategorías activas o con activos activos → HAS_DEPENDENCIES', async () => {
    await expect(service.deactivateCategory(1)).rejects.toMatchObject({ code: 'HAS_DEPENDENCIES', details: { activeChildren: 1 } });
    await expect(service.deactivateCategory(5)).rejects.toMatchObject({ code: 'HAS_DEPENDENCIES', details: { activeAssets: 2 } });
    expect(repo.findCategoryById).toHaveBeenCalledWith(5, { transaction: 'tx', lock: 'update' });
  });

  it('sin dependencias activas se desactiva', async () => {
    repo.countDependencies.mockResolvedValue({ activeChildren: 0, totalChildren: 0, activeAssets: 0, totalAssets: 1 });
    await service.deactivateCategory(6);
    expect(repo.updateCategory).toHaveBeenCalledWith(6, { isActive: false }, { transaction: 'tx' });
  });

  it('una subcategoría no se reactiva con el padre inactivo', async () => {
    repo.findCategoryById.mockResolvedValueOnce(cat(8, 'HIJA', 'Hija', VIEJA, { isActive: false }));
    await expect(service.activateCategory(8)).rejects.toMatchObject({ code: 'INACTIVE_RESOURCE' });
  });
});

describe('assertLeafCategoryAvailable (para activos, HU-302)', () => {
  it('VEHICULOS tiene hijas → CATEGORY_NOT_LEAF en categoryId (Módulo 5)', async () => {
    await expect(service.assertLeafCategoryAvailable(1, { transaction: 'tx' })).rejects.toMatchObject({
      code: 'CATEGORY_NOT_LEAF',
      details: [expect.objectContaining({ path: 'categoryId' })],
    });
  });

  it('inexistente → VALIDATION_ERROR; inactiva → INACTIVE_RESOURCE; hoja activa → bloqueada FOR SHARE', async () => {
    await expect(service.assertLeafCategoryAvailable(99, { transaction: 'tx' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(service.assertLeafCategoryAvailable(7, { transaction: 'tx' })).rejects.toMatchObject({ code: 'INACTIVE_RESOURCE' });
    await expect(service.assertLeafCategoryAvailable(3, { transaction: 'tx' })).resolves.toMatchObject({ code: 'TRACTOR' });
    expect(repo.findCategoryById).toHaveBeenLastCalledWith(3, { transaction: 'tx', lock: 'share' });
  });
});

describe('countAssets (HU-303)', () => {
  // Activos por rama: TRACTOR 2 (+1 inactivo), CAMPO 2, PERSONAL 3.
  const BRANCH = { 1: { active: 2, inactive: 1 }, 2: { active: 2, inactive: 1 }, 3: { active: 2, inactive: 1 }, 4: { active: 2, inactive: 0 }, 6: { active: 3, inactive: 0 } };
  const CHILDREN = { null: [CAMPO, PERSONAL, VEHICULOS], 1: [MAQUINARIA], 2: [TRACTOR], 3: [] };

  beforeEach(() => {
    repo.findChildCategories.mockImplementation(async (parentId) => CHILDREN[parentId] ?? []);
    repo.countAssetsInSubtrees.mockImplementation(async (ids) => ids.filter((id) => BRANCH[id]).map((id) => ({ categoryId: id, ...BRANCH[id] })));
    repo.findAncestors.mockResolvedValue([]);
    repo.findCategoryByCode.mockImplementation(async (code) => Object.values(ALL).find((c) => c.code === code) ?? null);
  });

  it('VEHICULOS suma toda su rama y desglosa por subcategoría directa, con una sola consulta de conteo', async () => {
    const result = await service.countAssets({ categoryId: 1 });
    expect(result.category).toMatchObject({ code: 'VEHICULOS', isLeaf: false, displayIcon: 'tractor', path: [] });
    expect(result.assets).toEqual({ active: 2, inactive: 1, total: 3 });
    expect(result.breakdown).toEqual([
      expect.objectContaining({ code: 'MAQUINARIA_AGRICOLA', isLeaf: false, assets: { active: 2, inactive: 1, total: 3 } }),
    ]);
    expect(repo.countAssetsInSubtrees).toHaveBeenCalledTimes(1);
    expect(repo.countAssetsInSubtrees).toHaveBeenCalledWith([1, 2]);
  });

  it('por código (count_assets del asistente) y con la ruta desde la raíz', async () => {
    repo.findAncestors.mockResolvedValue([ref(VEHICULOS), ref(MAQUINARIA)]);
    const result = await service.countAssets({ code: 'TRACTOR' });
    expect(result.category).toMatchObject({ code: 'TRACTOR', isLeaf: true });
    expect(result.category.path.map((p) => p.code)).toEqual(['VEHICULOS', 'MAQUINARIA_AGRICOLA']);
    expect(result.breakdown).toEqual([]);
    expect(result.assets.total).toBe(3);
  });

  it('sin categoría: resumen de la finca por raíz; una raíz sin activos cuenta 0', async () => {
    const result = await service.countAssets({});
    expect(result.category).toBeNull();
    expect(result.breakdown.map((g) => [g.code, g.assets.total])).toEqual([['CAMPO', 2], ['PERSONAL', 3], ['VEHICULOS', 3]]);
    expect(result.assets).toEqual({ active: 7, inactive: 1, total: 8 });
  });

  it('categoría inexistente, por id o por código → NOT_FOUND', async () => {
    await expect(service.countAssets({ categoryId: 99 })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(service.countAssets({ code: 'NO_EXISTE' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(repo.countAssetsInSubtrees).not.toHaveBeenCalled();
  });
});
