// Unitaria de las reglas de categorías de productos (business_rules.md §6.2) con el repository simulado.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('#src/modules/product/product_category/product_category.repository.js', () => ({
  listCategories: vi.fn(),
  findAllCategories: vi.fn(),
  findCategoryById: vi.fn(),
  findChildren: vi.fn(),
  findAncestors: vi.fn(),
  findSubtreeIds: vi.fn(),
  findTakenFields: vi.fn(),
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  countActiveDependencies: vi.fn(),
  lockTreeForMove: vi.fn(),
}));
vi.mock('#src/shared/db/transaction.js', () => ({ withTransaction: (fn) => fn('tx') }));

const repo = await import('#src/modules/product/product_category/product_category.repository.js');
const service = await import('#src/modules/product/product_category/product_category.service.js');

const dates = { createdAt: new Date('2026-11-01'), updatedAt: new Date('2026-11-01') };
const cat = (id, code, name, parentId = null, overrides = {}) => ({
  id,
  code,
  name,
  description: null,
  parentId,
  isActive: true,
  parent: null,
  activeChildren: 0,
  totalChildren: 0,
  activeProducts: 0,
  totalProducts: 0,
  ...dates,
  ...overrides,
});

// INSU › FERT › FOLI (foliares); REPU › FILT; LUBR con 2 productos.
const INSU = cat(1, 'INSU', 'Insumos agrícolas', null, { activeChildren: 1, totalChildren: 1, icon: 'sprout' });
const FERT = cat(2, 'FERT', 'Fertilizantes', 1, { parent: { id: 1, code: 'INSU', name: 'Insumos agrícolas', isActive: true }, totalChildren: 1, activeChildren: 1 });
const FOLI = cat(3, 'FOLI', 'Foliares', 2, { parent: { id: 2, code: 'FERT', name: 'Fertilizantes', isActive: true } });
const REPU = cat(4, 'REPU', 'Repuestos', null, { totalChildren: 1, activeChildren: 1 });
const FILT = cat(5, 'FILT', 'Filtros', 4, { parent: { id: 4, code: 'REPU', name: 'Repuestos', isActive: true }, totalProducts: 3, activeProducts: 3 });
const LUBR = cat(6, 'LUBR', 'Lubricantes', null, { totalProducts: 2, activeProducts: 2 });
const OLD = cat(7, 'VIEJ', 'Inactiva', null, { isActive: false });
const ORPH = cat(8, 'HUER', 'Hija de inactiva', 7, { isActive: false, parent: { id: 7, code: 'VIEJ', name: 'Inactiva', isActive: false } });
const ALL = { 1: INSU, 2: FERT, 3: FOLI, 4: REPU, 5: FILT, 6: LUBR, 7: OLD, 8: ORPH };
const SUBTREES = { 1: [1, 2, 3], 2: [2, 3], 3: [3], 4: [4, 5], 5: [5], 6: [6], 7: [7, 8], 8: [8] };

beforeEach(() => {
  vi.clearAllMocks();
  repo.findCategoryById.mockImplementation(async (id) => ALL[id] ?? null);
  repo.findSubtreeIds.mockImplementation(async (id) => SUBTREES[id] ?? []);
  repo.findTakenFields.mockResolvedValue({});
  repo.countActiveDependencies.mockResolvedValue({ activeChildren: 0, activeProducts: 0 });
  repo.createCategory.mockResolvedValue({ id: 3 });
});

describe('getCategoryTree', () => {
  it('arma el árbol con profundidad y productos de toda la rama', async () => {
    repo.findAllCategories.mockResolvedValue(Object.values(ALL));
    const tree = await service.getCategoryTree();
    const insu = tree.find((n) => n.code === 'INSU');
    expect(insu.children[0]).toMatchObject({ code: 'FERT', depth: 1, isLeaf: false });
    expect(insu.children[0].children[0]).toMatchObject({ code: 'FOLI', depth: 2, isLeaf: true, children: [] });
    expect(tree.find((n) => n.code === 'REPU').productsInSubtree).toBe(3);
  });

  it('con isActive=true omite las ramas inactivas', async () => {
    repo.findAllCategories.mockResolvedValue(Object.values(ALL));
    const codes = (await service.getCategoryTree({ isActive: true })).map((n) => n.code);
    expect(codes).not.toContain('VIEJ');
    expect(codes).toEqual(expect.arrayContaining(['INSU', 'REPU', 'LUBR']));
  });
});

describe('createCategory', () => {
  it('crea una subcategoría bajo un padre activo, bloqueado FOR SHARE', async () => {
    await service.createCategory({ code: 'FOLI', name: 'Foliares', description: null, parentId: 2 });
    expect(repo.findCategoryById).toHaveBeenCalledWith(2, { transaction: 'tx', lock: 'share' });
    expect(repo.createCategory).toHaveBeenCalledWith({ code: 'FOLI', name: 'Foliares', description: null, parentId: 2, icon: null }, { transaction: 'tx' });
  });

  it('código que no son 4 letras → INVALID_CODE_FORMAT', async () => {
    for (const code of ['LUB', 'LUBRI', 'LUB1']) {
      await expect(service.createCategory({ code, name: 'X', description: null, parentId: null })).rejects.toMatchObject({
        code: 'INVALID_CODE_FORMAT',
      });
    }
    expect(repo.createCategory).not.toHaveBeenCalled();
  });

  it('nombre repetido en el mismo padre o código repetido → DUPLICATE_CODE por campo (regla 2)', async () => {
    repo.findTakenFields.mockResolvedValue({ code: true, name: true });
    await expect(service.createCategory({ code: 'FERT', name: 'Fertilizantes', description: null, parentId: 1 })).rejects.toMatchObject({
      code: 'DUPLICATE_CODE',
      details: [expect.objectContaining({ path: 'code' }), expect.objectContaining({ path: 'name' })],
    });
    expect(repo.findTakenFields).toHaveBeenCalledWith({ code: 'FERT', name: 'Fertilizantes', parentId: 1 }, expect.anything());
  });

  it('padre inexistente → VALIDATION_ERROR; padre inactivo → INACTIVE_RESOURCE', async () => {
    await expect(service.createCategory({ code: 'ABCD', name: 'X', description: null, parentId: 99 })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      details: [expect.objectContaining({ path: 'parentId' })],
    });
    await expect(service.createCategory({ code: 'ABCD', name: 'X', description: null, parentId: 7 })).rejects.toMatchObject({
      code: 'INACTIVE_RESOURCE',
    });
  });
});

describe('updateCategory: mover (regla 1, sin ciclos)', () => {
  it('mover INSU dentro de su nieta FOLI → CATEGORY_CYCLE, sin escribir', async () => {
    await expect(service.updateCategory(1, { parentId: 3 })).rejects.toMatchObject({
      code: 'CATEGORY_CYCLE',
      details: [expect.objectContaining({ path: 'parentId' })],
    });
    expect(repo.lockTreeForMove).toHaveBeenCalled();
    expect(repo.updateCategory).not.toHaveBeenCalled();
  });

  it('ser su propio padre → CATEGORY_CYCLE', async () => {
    await expect(service.updateCategory(2, { parentId: 2 })).rejects.toMatchObject({ code: 'CATEGORY_CYCLE' });
  });

  it('mover FERT (con su rama) bajo REPU: valida el nombre contra sus nuevas hermanas', async () => {
    await service.updateCategory(2, { parentId: 4 });
    expect(repo.findTakenFields).toHaveBeenCalledWith(
      { code: undefined, name: 'Fertilizantes', parentId: 4 },
      { excludeId: 2, transaction: 'tx' }
    );
    expect(repo.updateCategory).toHaveBeenCalledWith(2, { parentId: 4 }, { transaction: 'tx' });
  });

  it('volverla raíz (parentId null) no necesita validar ciclos', async () => {
    await service.updateCategory(3, { parentId: null });
    expect(repo.findSubtreeIds).not.toHaveBeenCalled();
    expect(repo.updateCategory).toHaveBeenCalledWith(3, { parentId: null }, { transaction: 'tx' });
  });

  it('mover bajo una categoría inactiva → INACTIVE_RESOURCE', async () => {
    await expect(service.updateCategory(6, { parentId: 7 })).rejects.toMatchObject({ code: 'INACTIVE_RESOURCE' });
  });
});

describe('updateCategory: código y nombre', () => {
  it('con productos no cambia el código (es su prefijo) → HAS_DEPENDENCIES', async () => {
    await expect(service.updateCategory(6, { code: 'ACEI' })).rejects.toMatchObject({
      code: 'HAS_DEPENDENCIES',
      details: [expect.objectContaining({ path: 'code' })],
    });
  });

  it('con productos sí se corrigen el nombre y la descripción', async () => {
    await service.updateCategory(6, { name: 'Lubricantes y grasas', description: 'Aceites de motor' });
    expect(repo.updateCategory).toHaveBeenCalledWith(6, { name: 'Lubricantes y grasas', description: 'Aceites de motor' }, { transaction: 'tx' });
    expect(repo.lockTreeForMove).not.toHaveBeenCalled();
  });

  it('sin productos el código se cambia; sin cambios reales no escribe', async () => {
    await service.updateCategory(3, { code: 'FOLA' });
    expect(repo.updateCategory).toHaveBeenCalledWith(3, { code: 'FOLA' }, { transaction: 'tx' });
    repo.updateCategory.mockClear();
    await service.updateCategory(3, { code: 'FOLI', name: 'Foliares', parentId: 2 });
    expect(repo.updateCategory).not.toHaveBeenCalled();
  });
});

describe('deactivate / activate (regla 3)', () => {
  it('con subcategorías activas → HAS_DEPENDENCIES', async () => {
    repo.countActiveDependencies.mockResolvedValue({ activeChildren: 1, activeProducts: 0 });
    await expect(service.deactivateCategory(1)).rejects.toMatchObject({ code: 'HAS_DEPENDENCIES', details: { activeChildren: 1 } });
    expect(repo.findCategoryById).toHaveBeenCalledWith(1, { transaction: 'tx', lock: 'update' });
  });

  it('con productos activos → HAS_DEPENDENCIES', async () => {
    repo.countActiveDependencies.mockResolvedValue({ activeChildren: 0, activeProducts: 2 });
    await expect(service.deactivateCategory(6)).rejects.toMatchObject({ code: 'HAS_DEPENDENCIES', details: { activeProducts: 2 } });
  });

  it('sin dependencias activas se desactiva', async () => {
    await service.deactivateCategory(3);
    expect(repo.updateCategory).toHaveBeenCalledWith(3, { isActive: false }, { transaction: 'tx' });
  });

  it('una subcategoría no se reactiva con el padre inactivo', async () => {
    await expect(service.activateCategory(8)).rejects.toMatchObject({ code: 'INACTIVE_RESOURCE' });
    await service.activateCategory(7);
    expect(repo.updateCategory).toHaveBeenCalledWith(7, { isActive: true });
  });
});

describe('iconos (HU-301: solo en las raíces)', () => {
  it('el árbol muestra en cada subcategoría el icono de su raíz', async () => {
    repo.findAllCategories.mockResolvedValue(Object.values(ALL));
    const insu = (await service.getCategoryTree()).find((n) => n.code === 'INSU');
    expect(insu).toMatchObject({ icon: 'sprout', displayIcon: 'sprout' });
    expect(insu.children[0]).toMatchObject({ code: 'FERT', icon: null, displayIcon: 'sprout' });
    expect(insu.children[0].children[0]).toMatchObject({ code: 'FOLI', displayIcon: 'sprout' });
  });

  it('una raíz se crea con icono; una subcategoría con icono → VALIDATION_ERROR en icon', async () => {
    await service.createCategory({ code: 'SEMI', name: 'Semillas', description: null, parentId: null, icon: 'wheat' });
    expect(repo.createCategory).toHaveBeenCalledWith(expect.objectContaining({ icon: 'wheat' }), { transaction: 'tx' });

    await expect(service.createCategory({ code: 'FOLI', name: 'Foliares', description: null, parentId: 2, icon: 'leaf' })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      details: [expect.objectContaining({ path: 'icon' })],
    });
    expect(repo.createCategory).toHaveBeenCalledTimes(1);
  });

  it('cambia el icono de una raíz y lo borra al moverla dentro de otra', async () => {
    await service.updateCategory(1, { icon: 'leaf' });
    expect(repo.updateCategory).toHaveBeenLastCalledWith(1, { icon: 'leaf' }, { transaction: 'tx' });

    await service.updateCategory(1, { parentId: 6 });
    expect(repo.updateCategory).toHaveBeenLastCalledWith(1, { parentId: 6, icon: null }, { transaction: 'tx' });
  });
});

describe('assertCategoryAvailable (para productos, HU-204)', () => {
  it('inexistente → VALIDATION_ERROR en categoryId; inactiva → INACTIVE_RESOURCE; activa → bloqueada FOR SHARE', async () => {
    await expect(service.assertCategoryAvailable(99, { transaction: 'tx' })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      details: [expect.objectContaining({ path: 'categoryId' })],
    });
    await expect(service.assertCategoryAvailable(7, { transaction: 'tx' })).rejects.toMatchObject({ code: 'INACTIVE_RESOURCE' });
    await expect(service.assertCategoryAvailable(6, { transaction: 'tx' })).resolves.toMatchObject({ code: 'LUBR' });
    expect(repo.findCategoryById).toHaveBeenLastCalledWith(6, { transaction: 'tx', lock: 'share' });
  });
});
