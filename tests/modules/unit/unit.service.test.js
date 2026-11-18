// Unitaria de las reglas de unidades (business_rules.md §6.3) con el repository simulado.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('#src/modules/product/unit/unit.repository.js', () => ({
  listUnits: vi.fn(),
  findUnitById: vi.fn(),
  findUnitByCode: vi.fn(),
  findTakenFields: vi.fn(),
  createUnit: vi.fn(),
  updateUnit: vi.fn(),
  countUsage: vi.fn(),
}));
vi.mock('#src/shared/db/transaction.js', () => ({ withTransaction: (fn) => fn('tx') }));

const repo = await import('#src/modules/product/unit/unit.repository.js');
const service = await import('#src/modules/product/unit/unit.service.js');

const dates = { createdAt: new Date('2026-11-01'), updatedAt: new Date('2026-11-01') };
const L = { id: 1, code: 'L', name: 'Litro', baseUnitId: null, conversionFactor: '1.000000', isActive: true, baseUnit: null, ...dates };
const KG = { id: 2, code: 'KG', name: 'Kilogramo', baseUnitId: null, conversionFactor: '1.000000', isActive: true, baseUnit: null, ...dates };
const derived = (code, factor, base = L, overrides = {}) => ({
  id: 10,
  code,
  name: code,
  baseUnitId: base.id,
  conversionFactor: factor,
  isActive: true,
  baseUnit: { id: base.id, code: base.code, name: base.name, isActive: base.isActive },
  ...dates,
  ...overrides,
});
const TAMB = derived('TAMB', '208.000000');
const ML = derived('ML', '0.001000', L, { id: 11 });
const GAL = derived('GAL', '3.785411', L, { id: 12 });

beforeEach(() => {
  vi.clearAllMocks();
  repo.findTakenFields.mockResolvedValue({});
  repo.countUsage.mockResolvedValue({ activeProducts: 0, activeDerivedUnits: 0 });
  repo.findUnitById.mockImplementation(async (id) => ({ 1: L, 2: KG, 10: TAMB, 11: ML, 12: GAL })[id] ?? null);
  repo.createUnit.mockResolvedValue({ id: 10 });
});

describe('createUnit', () => {
  it('unidad base: factor 1 y sin base (regla 1)', async () => {
    await service.createUnit({ code: 'CAJA', name: 'Caja', baseUnitId: null });
    expect(repo.createUnit).toHaveBeenCalledWith({ code: 'CAJA', name: 'Caja', baseUnitId: null, conversionFactor: '1' });
  });

  it('una base con factor distinto de 1 → VALIDATION_ERROR', async () => {
    await expect(service.createUnit({ code: 'CAJA', name: 'Caja', baseUnitId: null, conversionFactor: '12' })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      details: [expect.objectContaining({ path: 'conversionFactor' })],
    });
  });

  it('derivada: TAMB = 208 L (regla 2)', async () => {
    const dto = await service.createUnit({ code: 'TAMB', name: 'Tambor', baseUnitId: 1, conversionFactor: '208' });
    expect(repo.createUnit).toHaveBeenCalledWith({ code: 'TAMB', name: 'Tambor', baseUnitId: 1, conversionFactor: '208' });
    expect(dto).toMatchObject({ isBase: false, conversionFactor: '208', equivalence: '1 TAMB = 208 L' });
  });

  it('derivada sin factor o con factor 0 → VALIDATION_ERROR', async () => {
    await expect(service.createUnit({ code: 'BID', name: 'Bidón', baseUnitId: 1 })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(service.createUnit({ code: 'BID', name: 'Bidón', baseUnitId: 1, conversionFactor: '0' })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('la base no puede ser una derivada (sin cadenas TAMB → GAL → L)', async () => {
    await expect(service.createUnit({ code: 'BID', name: 'Bidón', baseUnitId: 12, conversionFactor: '5' })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: expect.stringContaining('GAL es una unidad derivada'),
    });
  });

  it('la base debe existir y estar activa', async () => {
    await expect(service.createUnit({ code: 'BID', name: 'Bidón', baseUnitId: 99, conversionFactor: '5' })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    repo.findUnitById.mockResolvedValueOnce({ ...KG, isActive: false });
    await expect(service.createUnit({ code: 'BUL', name: 'Bulto', baseUnitId: 2, conversionFactor: '25' })).rejects.toMatchObject({
      code: 'INACTIVE_RESOURCE',
    });
  });

  it.each(['l2', 'T-1', 'ABCDEFGHIJK', 'Ñ'])('código %s → INVALID_CODE_FORMAT', async (code) => {
    await expect(service.createUnit({ code, name: 'X', baseUnitId: null })).rejects.toMatchObject({ code: 'INVALID_CODE_FORMAT' });
  });

  it('código o nombre repetido → DUPLICATE_CODE', async () => {
    repo.findTakenFields.mockResolvedValue({ code: true });
    await expect(service.createUnit({ code: 'L', name: 'Litro 2', baseUnitId: null })).rejects.toMatchObject({ code: 'DUPLICATE_CODE' });
  });
});

describe('updateUnit', () => {
  it('corrige el factor aunque la usen productos (solo afecta conversiones futuras)', async () => {
    repo.findUnitById.mockResolvedValueOnce({ ...TAMB, totalProducts: 3 });
    await service.updateUnit(10, { conversionFactor: '200' });
    expect(repo.updateUnit).toHaveBeenCalledWith(10, { conversionFactor: '200' });
  });

  it('no cambia el código ni la base si la usan productos → HAS_DEPENDENCIES', async () => {
    repo.findUnitById.mockResolvedValue({ ...TAMB, totalProducts: 3 });
    await expect(service.updateUnit(10, { code: 'TAM' })).rejects.toMatchObject({ code: 'HAS_DEPENDENCIES' });
    await expect(service.updateUnit(10, { baseUnitId: 2, conversionFactor: '200' })).rejects.toMatchObject({ code: 'HAS_DEPENDENCIES' });
    expect(repo.updateUnit).not.toHaveBeenCalled();
  });

  it('una base con derivadas no se convierte en derivada', async () => {
    repo.findUnitById.mockImplementation(async (id) => (id === 1 ? { ...L, totalDerivedUnits: 3 } : KG));
    await expect(service.updateUnit(1, { baseUnitId: 2, conversionFactor: '5' })).rejects.toMatchObject({ code: 'HAS_DEPENDENCIES' });
  });

  it('una derivada sin uso pasa a ser base y su factor vuelve a 1', async () => {
    await service.updateUnit(10, { baseUnitId: null });
    expect(repo.updateUnit).toHaveBeenCalledWith(10, { baseUnitId: null, conversionFactor: '1' });
  });

  it('no puede ser su propia base', async () => {
    await expect(service.updateUnit(1, { baseUnitId: 1, conversionFactor: '2' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('sin cambios reales no escribe', async () => {
    await service.updateUnit(10, { code: 'TAMB', conversionFactor: '208' });
    expect(repo.updateUnit).not.toHaveBeenCalled();
  });
});

describe('deactivateUnit (regla 3)', () => {
  it('usada por productos activos → HAS_DEPENDENCIES', async () => {
    repo.countUsage.mockResolvedValue({ activeProducts: 2, activeDerivedUnits: 0 });
    await expect(service.deactivateUnit(10)).rejects.toMatchObject({ code: 'HAS_DEPENDENCIES', details: { activeProducts: 2 } });
    expect(repo.updateUnit).not.toHaveBeenCalled();
  });

  it('base con derivadas activas → HAS_DEPENDENCIES', async () => {
    repo.countUsage.mockResolvedValue({ activeProducts: 0, activeDerivedUnits: 3 });
    await expect(service.deactivateUnit(1)).rejects.toMatchObject({ code: 'HAS_DEPENDENCIES', details: { activeDerivedUnits: 3 } });
  });

  it('sin uso: bloquea la fila, cuenta y desactiva en la misma transacción', async () => {
    await service.deactivateUnit(10);
    expect(repo.findUnitById).toHaveBeenCalledWith(10, { transaction: 'tx', lock: true });
    expect(repo.updateUnit).toHaveBeenCalledWith(10, { isActive: false }, { transaction: 'tx' });
  });

  it('una derivada no se reactiva con la base inactiva', async () => {
    repo.findUnitById.mockResolvedValue({ ...TAMB, isActive: false, baseUnit: { ...TAMB.baseUnit, isActive: false } });
    await expect(service.activateUnit(10)).rejects.toMatchObject({ code: 'INACTIVE_RESOURCE' });
  });
});

describe('convertQuantity (decimal.js)', () => {
  it.each([
    ['2', TAMB, L, '416.000'],
    ['416', L, TAMB, '2.000'],
    ['500', ML, GAL, '0.132'],
    ['1', GAL, ML, '3785.411'],
    ['0.1', ML, ML, '0.100'],
  ])('%s %s → %s', (quantity, from, to, expected) => {
    expect(service.convertQuantity(quantity, from, to).result).toBe(expected);
  });

  it('sin errores de coma flotante: 0.1 + 0.2 L en ML', () => {
    expect(service.convertQuantity('0.3', L, ML).result).toBe('300.000');
  });

  it('familias distintas (L → KG) → VALIDATION_ERROR', () => {
    expect(() => service.convertQuantity('1', L, KG)).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
  });
});
