// Unitarias de la orden de retiro (HU-401): reglas de fecha y de líneas, y el service con los
// repositories y las validaciones de catálogos simulados.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('#src/modules/movement/movement.repository.js', () => ({
  findMovementById: vi.fn(),
  findByIdempotencyKey: vi.fn(),
  nextDocumentNumber: vi.fn(),
  nextWithdrawalReferenceNumber: vi.fn(),
  createMovement: vi.fn(),
}));
vi.mock('#src/modules/stock/stock.repository.js', () => ({
  lockStockRows: vi.fn(),
  decrementStock: vi.fn(),
  findStockTotals: vi.fn(),
}));
vi.mock('#src/modules/warehouse/warehouse.service.js', () => ({ assertWarehouseAvailable: vi.fn() }));
vi.mock('#src/modules/product/product.service.js', () => ({ assertProductAvailable: vi.fn() }));
vi.mock('#src/modules/asset/asset.service.js', () => ({ assertAssetAvailable: vi.fn() }));
vi.mock('#src/shared/db/transaction.js', () => ({ withTransaction: (fn) => fn('tx') }));

const repo = await import('#src/modules/movement/movement.repository.js');
const stock = await import('#src/modules/stock/stock.repository.js');
const { assertWarehouseAvailable } = await import('#src/modules/warehouse/warehouse.service.js');
const { assertProductAvailable } = await import('#src/modules/product/product.service.js');
const { assertAssetAvailable } = await import('#src/modules/asset/asset.service.js');
const service = await import('#src/modules/movement/movement.service.js');
const { consolidateLines, resolveMovementDate } = await import('#src/modules/movement/movement.rules.js');

const ALMACENISTA = { id: 7, hierarchy: 2 };
const ADMIN = { id: 2, hierarchy: 1 };
const PRODUCTS = { 10: { id: 10, code: 'COMB-0001', isActive: true }, 11: { id: 11, code: 'LUBR-0001', isActive: true } };

const storedMovement = (id = 1) => ({
  id,
  documentNumber: 'RET-000145',
  movementType: 'OUT',
  reason: 'CONSUMO',
  reference: null,
  movementDate: '2026-11-22T12:00:00Z',
  createdAt: '2026-11-22T12:00:00Z',
  createdBy: { id: 7, fullName: 'Almacenista', username: 'alm' },
  fromWarehouse: { id: 2, code: 'COMB', name: 'Combustibles' },
  toWarehouse: null,
  receivedBy: 'Pedro Gómez',
  note: null,
  lines: [{ id: 1, quantity: '200.000', note: null, product: { id: 10, code: 'COMB-0001', name: 'Diésel', unit: { code: 'L' } }, asset: null }],
});

const order = (lines, overrides = {}) => ({ warehouseId: 2, reason: 'CONSUMO', receivedBy: 'Pedro Gómez', note: null, lines, ...overrides });

beforeEach(() => {
  vi.clearAllMocks();
  repo.findByIdempotencyKey.mockResolvedValue(null);
  repo.findMovementById.mockResolvedValue(storedMovement());
  repo.nextDocumentNumber.mockResolvedValue('RET-000145');
  repo.nextWithdrawalReferenceNumber.mockResolvedValue(7);
  repo.createMovement.mockResolvedValue(1);
  assertWarehouseAvailable.mockResolvedValue({ id: 2, code: 'COMB', isActive: true });
  assertProductAvailable.mockImplementation(async (id) => PRODUCTS[id]);
  assertAssetAvailable.mockResolvedValue({ id: 1, isActive: true });
  stock.lockStockRows.mockResolvedValue(new Map([[10, '300.000'], [11, '20.000']]));
  stock.findStockTotals.mockResolvedValue([]);
});

describe('resolveMovementDate (business_rules.md §4)', () => {
  const now = new Date('2026-11-22T15:00:00');
  it('sin fecha usa ahora; futura → MOVEMENT_DATE_INVALID', () => {
    expect(resolveMovementDate({}, ALMACENISTA, now)).toBe(now);
    expect(() => resolveMovementDate({ movementDate: new Date('2026-11-22T16:00:00') }, ALMACENISTA, now)).toThrow(expect.objectContaining({ code: 'MOVEMENT_DATE_INVALID' }));
  });
  it('ALMACENISTA: el 19 a primera hora sí (3 días), el 18 no', () => {
    expect(resolveMovementDate({ movementDate: new Date('2026-11-19T00:30:00') }, ALMACENISTA, now)).toEqual(new Date('2026-11-19T00:30:00'));
    expect(() => resolveMovementDate({ movementDate: new Date('2026-11-18T23:59:00') }, ALMACENISTA, now)).toThrow(expect.objectContaining({ code: 'MOVEMENT_DATE_INVALID' }));
  });
  it('ADMIN: sin límite, pero con más de 3 días exige observación', () => {
    expect(() => resolveMovementDate({ movementDate: new Date('2026-10-01T10:00:00') }, ADMIN, now)).toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
    expect(resolveMovementDate({ movementDate: new Date('2026-10-01T10:00:00'), note: 'Carga tardía' }, ADMIN, now)).toEqual(new Date('2026-10-01T10:00:00'));
  });
});

describe('consolidateLines (§3 regla 4)', () => {
  it('suma producto + activo repetidos con decimal.js y recuerda qué líneas se unieron', () => {
    const lines = consolidateLines([
      { productId: 10, assetId: 1, quantity: '0.1' },
      { productId: 10, assetId: 2, quantity: '5' },
      { productId: 10, assetId: 1, quantity: '0.2', note: 'segunda' },
    ]);
    expect(lines.map((l) => [l.productId, l.assetId, l.quantity.toFixed(3), l.sources, l.note])).toEqual([
      [10, 1, '0.300', [1, 3], 'segunda'],
      [10, 2, '5.000', [2], null],
    ]);
  });
});

describe('createWithdrawalOrder', () => {
  it('bloquea el stock en orden ascendente de producto, descuenta el total de cada producto y numera dentro de la transacción', async () => {
    const result = await service.createWithdrawalOrder(
      order([
        { productId: 11, quantity: '8', assetId: 1 },
        { productId: 10, quantity: '200', assetId: 1 },
        { productId: 10, quantity: '50.5', assetId: 2 },
      ]),
      { actor: ALMACENISTA }
    );
    expect(stock.lockStockRows).toHaveBeenCalledWith(2, [10, 11], { transaction: 'tx' });
    expect(stock.decrementStock.mock.calls.map((c) => [c[1], c[2]])).toEqual([
      [10, '250.500'],
      [11, '8.000'],
    ]);
    expect(repo.nextDocumentNumber).toHaveBeenCalledWith('OUT', { transaction: 'tx' });
    expect(repo.createMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        documentNumber: 'RET-000145',
        reference: `COMB-${new Date().getFullYear()}-000007`,
        movementType: 'OUT',
        warehouseFromId: 2,
        warehouseToId: null,
        createdByUserId: 7,
      }),
      { transaction: 'tx' }
    );
    expect(result).toMatchObject({ duplicated: false, movement: { documentNumber: 'RET-000145' } });
  });

  it('la suma de las líneas supera la existencia → INSUFFICIENT_STOCK sin numerar ni escribir', async () => {
    await expect(
      service.createWithdrawalOrder(order([{ productId: 10, quantity: '200', assetId: 1 }, { productId: 10, quantity: '150', assetId: 2 }]), { actor: ALMACENISTA })
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK', details: [expect.objectContaining({ available: '300.000', requested: '350.000' })] });
    expect(repo.nextDocumentNumber).not.toHaveBeenCalled();
    expect(repo.nextWithdrawalReferenceNumber).not.toHaveBeenCalled();
    expect(repo.createMovement).not.toHaveBeenCalled();
    expect(stock.decrementStock).not.toHaveBeenCalled();
  });

  it('un producto sin fila de stock en el almacén cuenta como 0', async () => {
    stock.lockStockRows.mockResolvedValue(new Map());
    await expect(service.createWithdrawalOrder(order([{ productId: 10, quantity: '1', assetId: 1 }]), { actor: ALMACENISTA })).rejects.toMatchObject({
      code: 'INSUFFICIENT_STOCK',
    });
  });

  it('reglas de forma antes de abrir la transacción: motivo, líneas, activo, recibido por y observación', async () => {
    const reject = (input) => service.createWithdrawalOrder(input, { actor: ALMACENISTA });
    await expect(reject(order([{ productId: 10, quantity: '1' }], { reason: 'COMPRA' }))).rejects.toMatchObject({ code: 'INVALID_MOVEMENT_REASON' });
    await expect(reject(order([]))).rejects.toMatchObject({ code: 'EMPTY_MOVEMENT' });
    await expect(reject(order([{ productId: 10, quantity: '1' }]))).rejects.toMatchObject({ code: 'ASSET_REQUIRED' });
    await expect(reject(order([{ productId: 10, quantity: '1', assetId: 1 }], { reason: 'PRESTAMO', receivedBy: null }))).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(reject(order([{ productId: 10, quantity: '1' }], { reason: 'OTRO' }))).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(assertWarehouseAvailable).not.toHaveBeenCalled();
  });

  it('Idempotency-Key ya usado por el mismo usuario: devuelve el original sin abrir transacción; por otro → DUPLICATE_REQUEST', async () => {
    repo.findByIdempotencyKey.mockResolvedValue({ id: 1, createdByUserId: 7 });
    const result = await service.createWithdrawalOrder(order([{ productId: 10, quantity: '1', assetId: 1 }]), { actor: ALMACENISTA, idempotencyKey: 'k' });
    expect(result.duplicated).toBe(true);
    expect(stock.lockStockRows).not.toHaveBeenCalled();
    await expect(
      service.createWithdrawalOrder(order([{ productId: 10, quantity: '1', assetId: 1 }]), { actor: { id: 99, hierarchy: 2 }, idempotencyKey: 'k' })
    ).rejects.toMatchObject({ code: 'DUPLICATE_REQUEST' });
  });

  it('avisa los productos que quedan bajo su mínimo, sin bloquear', async () => {
    stock.findStockTotals.mockResolvedValue([
      { productId: 10, code: 'COMB-0001', name: 'Diésel', unitCode: 'L', total: '100', minStock: '500' },
      { productId: 11, code: 'LUBR-0001', name: 'Aceite', unitCode: 'L', total: '12', minStock: '10' },
    ]);
    const result = await service.createWithdrawalOrder(order([{ productId: 10, quantity: '200', assetId: 1 }]), { actor: ALMACENISTA });
    expect(result.warnings.belowMinimum).toEqual([expect.objectContaining({ productCode: 'COMB-0001', total: '100.000', minStock: '500.000' })]);
  });
});

describe('withdrawalReference', () => {
  it('almacén, año de la fecha del movimiento y 6 dígitos', () => {
    expect(service.withdrawalReference({ code: 'TALL' }, new Date('2026-03-01T12:00:00'), 1)).toBe('TALL-2026-000001');
    expect(service.withdrawalReference({ code: 'COMB' }, new Date('2025-12-31T23:00:00'), 999999)).toBe('COMB-2025-999999');
  });

  it('una orden con fecha del año anterior usa el contador de ese año', async () => {
    const lastYear = new Date(new Date().getFullYear() - 1, 11, 31, 12);
    await service.createWithdrawalOrder(
      order([{ productId: 10, quantity: '1', assetId: 1 }], { movementDate: lastYear, note: 'Orden de diciembre cargada en enero' }),
      { actor: ADMIN }
    );
    expect(repo.nextWithdrawalReferenceNumber).toHaveBeenCalledWith(2, lastYear.getFullYear(), { transaction: 'tx' });
  });
});
