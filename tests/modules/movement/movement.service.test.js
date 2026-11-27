// Unitarias de la orden de retiro (HU-401): reglas de fecha y de líneas, y el service con los
// repositories y las validaciones de catálogos simulados.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('#src/modules/movement/movement.repository.js', () => ({
  findMovementById: vi.fn(),
  findByIdempotencyKey: vi.fn(),
  nextDocumentNumber: vi.fn(),
  nextWithdrawalReferenceNumber: vi.fn(),
  createMovement: vi.fn(),
  findDocument: vi.fn(),
  attachDocumentFile: vi.fn(),
}));
vi.mock('#src/shared/storage/fileStorage.js', () => ({ saveFile: vi.fn(), readStoredFile: vi.fn(), removeFile: vi.fn() }));
vi.mock('#src/modules/stock/stock.repository.js', () => ({
  lockStockRows: vi.fn(),
  decrementStock: vi.fn(),
  incrementStock: vi.fn(),
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
const fileStorage = await import('#src/shared/storage/fileStorage.js');
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

describe('createEntry (HU-402)', () => {
  const entry = (lines, overrides = {}) => ({ warehouseId: 5, reason: 'COMPRA', reference: null, note: null, lines, ...overrides });

  beforeEach(() => {
    repo.nextDocumentNumber.mockResolvedValue('ENT-000032');
    assertWarehouseAvailable.mockResolvedValue({ id: 5, code: 'PRIN', isActive: true });
  });

  it('suma el total de cada producto en orden ascendente, con ENT- y sin activo ni referencia automática', async () => {
    const result = await service.createEntry(
      entry([
        { productId: 11, quantity: '4' },
        { productId: 10, quantity: '0.1' },
        { productId: 10, quantity: '0.2' },
      ]),
      { actor: ALMACENISTA }
    );
    expect(assertWarehouseAvailable).toHaveBeenCalledWith(5, { transaction: 'tx', role: 'destino' });
    expect(repo.nextDocumentNumber).toHaveBeenCalledWith('IN', { transaction: 'tx' });
    expect(repo.nextWithdrawalReferenceNumber).not.toHaveBeenCalled();
    expect(stock.incrementStock.mock.calls.map((c) => [c[1], c[2]])).toEqual([
      [10, '0.300'],
      [11, '4.000'],
    ]);
    expect(stock.lockStockRows).not.toHaveBeenCalled();
    expect(repo.createMovement).toHaveBeenCalledWith(
      expect.objectContaining({ movementType: 'IN', warehouseFromId: null, warehouseToId: 5, reference: null, workOrder: null }),
      { transaction: 'tx' }
    );
    expect(result.warnings.consolidated).toEqual([{ productId: 10, assetId: null, lines: [2, 3] }]);
  });

  it('avisa los productos que quedan sobre su máximo; sin máximo no avisa', async () => {
    stock.findStockTotals.mockResolvedValue([
      { productId: 10, code: 'COMB-0001', name: 'Diésel', unitCode: 'L', total: '10500', minStock: '500', maxStock: '10000' },
      { productId: 11, code: 'LUBR-0001', name: 'Aceite', unitCode: 'L', total: '900', minStock: '50', maxStock: null },
    ]);
    const result = await service.createEntry(entry([{ productId: 10, quantity: '1000' }, { productId: 11, quantity: '1' }]), { actor: ALMACENISTA });
    expect(result.warnings.aboveMaximum).toEqual([expect.objectContaining({ productCode: 'COMB-0001', total: '10500.000', maxStock: '10000.000' })]);
  });

  it('reglas de forma antes de abrir la transacción', async () => {
    const reject = (input) => service.createEntry(input, { actor: ALMACENISTA });
    await expect(reject(entry([{ productId: 10, quantity: '1' }], { reason: 'DEVOLUCION' }))).rejects.toMatchObject({ code: 'INVALID_MOVEMENT_REASON' });
    await expect(reject(entry([{ productId: 10, quantity: '1' }], { reason: 'VENTA' }))).rejects.toMatchObject({ code: 'INVALID_MOVEMENT_REASON' });
    await expect(reject(entry([]))).rejects.toMatchObject({ code: 'EMPTY_MOVEMENT' });
    await expect(reject(entry([{ productId: 10, quantity: '1' }], { reason: 'OTRO' }))).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(reject(entry([{ productId: 10, quantity: '1' }], { reference: 'REV-ENT-000032' }))).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(reject(entry([{ productId: 10, quantity: '1', assetId: 3 }]))).rejects.toMatchObject({ code: 'ASSET_NOT_ALLOWED' });
    expect(assertWarehouseAvailable).not.toHaveBeenCalled();
  });
});

describe('createTransfer (HU-403)', () => {
  const WAREHOUSES = { 2: { id: 2, code: 'COMB', isActive: true }, 5: { id: 5, code: 'PRIN', isActive: true } };
  const transfer = (lines, overrides = {}) => ({ warehouseFromId: 2, warehouseToId: 5, note: null, lines, ...overrides });

  /** Orden real de las llamadas a stock: [función, almacén, producto]. */
  const stockCalls = () =>
    [
      ...stock.lockStockRows.mock.calls.map((c, i) => ({ order: stock.lockStockRows.mock.invocationCallOrder[i], call: ['lock', c[0], c[1]] })),
      ...stock.decrementStock.mock.calls.map((c, i) => ({ order: stock.decrementStock.mock.invocationCallOrder[i], call: ['dec', c[0], c[1], c[2]] })),
      ...stock.incrementStock.mock.calls.map((c, i) => ({ order: stock.incrementStock.mock.invocationCallOrder[i], call: ['inc', c[0], c[1], c[2]] })),
    ]
      .sort((a, b) => a.order - b.order)
      .map((x) => x.call);

  beforeEach(() => {
    repo.nextDocumentNumber.mockResolvedValue('TRF-000010');
    assertWarehouseAvailable.mockImplementation(async (id) => WAREHOUSES[id]);
  });

  it('origen de id menor: bloquea y resta en el origen, luego suma en el destino; TRF- con motivo TRASLADO', async () => {
    const result = await service.createTransfer(
      transfer([
        { productId: 11, quantity: '4' },
        { productId: 10, quantity: '100' },
        { productId: 10, quantity: '50.5' },
      ]),
      { actor: ALMACENISTA }
    );
    expect(assertWarehouseAvailable.mock.calls).toEqual([
      [2, { transaction: 'tx', role: 'origen' }],
      [5, { transaction: 'tx', role: 'destino' }],
    ]);
    expect(stockCalls()).toEqual([
      ['lock', 2, [10, 11]],
      ['dec', 2, 10, '150.500'],
      ['dec', 2, 11, '4.000'],
      ['inc', 5, 10, '150.500'],
      ['inc', 5, 11, '4.000'],
    ]);
    expect(repo.nextDocumentNumber).toHaveBeenCalledWith('TRANSFER', { transaction: 'tx' });
    expect(repo.createMovement).toHaveBeenCalledWith(
      expect.objectContaining({ movementType: 'TRANSFER', reason: 'TRASLADO', warehouseFromId: 2, warehouseToId: 5, reference: null, documentNumber: 'TRF-000010' }),
      { transaction: 'tx' }
    );
    expect(result.warnings).toEqual({ consolidated: [{ productId: 10, assetId: null, lines: [2, 3] }] });
  });

  it('destino de id menor: suma primero en el destino y después valida el origen (orden global por almacén, sin deadlocks)', async () => {
    await service.createTransfer(transfer([{ productId: 10, quantity: '10' }], { warehouseFromId: 5, warehouseToId: 2 }), { actor: ALMACENISTA });
    expect(assertWarehouseAvailable.mock.calls.map((c) => c[0])).toEqual([2, 5]);
    expect(stockCalls()).toEqual([
      ['inc', 2, 10, '10.000'],
      ['lock', 5, [10]],
      ['dec', 5, 10, '10.000'],
    ]);
    expect(repo.createMovement).toHaveBeenCalledWith(expect.objectContaining({ warehouseFromId: 5, warehouseToId: 2 }), { transaction: 'tx' });
  });

  it('la suma de las líneas supera la existencia del origen → INSUFFICIENT_STOCK sin numerar ni registrar', async () => {
    await expect(service.createTransfer(transfer([{ productId: 10, quantity: '200' }, { productId: 10, quantity: '150' }]), { actor: ALMACENISTA })).rejects.toMatchObject({
      code: 'INSUFFICIENT_STOCK',
      details: [expect.objectContaining({ productCode: 'COMB-0001', warehouseCode: 'COMB', available: '300.000', requested: '350.000' })],
    });
    expect(stock.decrementStock).not.toHaveBeenCalled();
    expect(repo.nextDocumentNumber).not.toHaveBeenCalled();
    expect(repo.createMovement).not.toHaveBeenCalled();
  });

  it('reglas de forma antes de abrir la transacción: mismo almacén, sin líneas, activo en una línea', async () => {
    const reject = (input) => service.createTransfer(input, { actor: ALMACENISTA });
    await expect(reject(transfer([{ productId: 10, quantity: '1' }], { warehouseToId: 2 }))).rejects.toMatchObject({
      code: 'INVALID_MOVEMENT_WAREHOUSES',
      details: [expect.objectContaining({ path: 'warehouseToId' })],
    });
    await expect(reject(transfer([]))).rejects.toMatchObject({ code: 'EMPTY_MOVEMENT' });
    await expect(reject(transfer([{ productId: 10, quantity: '1' }, { productId: 11, quantity: '1', assetId: 3 }]))).rejects.toMatchObject({
      code: 'ASSET_NOT_ALLOWED',
      details: [expect.objectContaining({ path: 'lines.1.assetId', line: 2 })],
    });
    expect(assertWarehouseAvailable).not.toHaveBeenCalled();
  });
});

describe('documentos de recepción de la entrada', () => {
  const entry = (documents, overrides = {}) => ({
    warehouseId: 5,
    reason: 'COMPRA',
    reference: null,
    note: null,
    lines: [{ productId: 10, quantity: '1' }],
    documents,
    ...overrides,
  });
  const factura = { documentType: 'FACTURA', documentNumber: '0012345', supplierName: 'Agro Sur', supplierTaxId: null, issueDate: '2026-11-20', totalAmount: '150.00', currency: 'USD' };
  const vale = { documentType: 'VALE', documentNumber: '88', supplierName: null, supplierTaxId: null, issueDate: null, totalAmount: null, currency: null };

  beforeEach(() => {
    repo.nextDocumentNumber.mockResolvedValue('ENT-000033');
    assertWarehouseAvailable.mockResolvedValue({ id: 5, code: 'PRIN', isActive: true });
  });

  it('guarda los documentos con la entrada y, sin referencia escrita, toma la del primero (FAC-0012345)', async () => {
    await service.createEntry(entry([factura, vale]), { actor: ALMACENISTA });
    expect(repo.createMovement).toHaveBeenCalledWith(
      expect.objectContaining({ reference: 'FAC-0012345', documents: [factura, vale] }),
      { transaction: 'tx' }
    );
    expect(service.entryReference({ reference: 'OC-2026-0087', documents: [factura] })).toBe('OC-2026-0087');
    expect(service.entryReference({ reference: null, documents: [vale] })).toBe('VAL-88');
    expect(service.entryReference({ reference: null, documents: [] })).toBeNull();
  });

  it('el mismo tipo y número repetido, o una fecha de emisión futura → VALIDATION_ERROR señalando el documento', async () => {
    await expect(service.createEntry(entry([factura, vale, { ...factura }]), { actor: ALMACENISTA })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      details: [expect.objectContaining({ path: 'documents.2.documentNumber' })],
    });
    await expect(service.createEntry(entry([{ ...vale, issueDate: '2999-01-01' }]), { actor: ALMACENISTA })).rejects.toMatchObject({
      details: [expect.objectContaining({ path: 'documents.0.issueDate' })],
    });
    expect(repo.createMovement).not.toHaveBeenCalled();
  });
});

describe('attachDocumentFile', () => {
  const PDF = Buffer.from('%PDF-1.7 contenido');
  const stored = (overrides = {}) => ({
    id: 4,
    movementHeaderId: 1,
    documentType: 'FACTURA',
    documentNumber: '0012345',
    supplierName: null,
    supplierTaxId: null,
    issueDate: null,
    totalAmount: null,
    currency: null,
    fileStorageKey: null,
    createdAt: '2026-11-26T12:00:00Z',
    header: { id: 1, movementType: 'IN', createdByUserId: ALMACENISTA.id },
    ...overrides,
  });
  const attached = stored({
    fileStorageKey: 'x.pdf',
    fileOriginalName: 'factura.pdf',
    fileMimeType: 'application/pdf',
    fileSizeBytes: PDF.length,
    fileSha256: 'a'.repeat(64),
    fileUploadedAt: '2026-11-26T12:05:00Z',
    fileUploadedBy: { id: 7, fullName: 'Almacenista' },
  });
  const file = (overrides = {}) => ({ buffer: PDF, mimeType: 'application/pdf', originalName: 'factura.pdf', ...overrides });

  it('guarda en disco, adjunta con sha256 y tamaño, y devuelve el documento', async () => {
    repo.findDocument.mockResolvedValueOnce(stored()).mockResolvedValueOnce(stored()).mockResolvedValueOnce(attached);
    const doc = await service.attachDocumentFile(1, 4, file(), { actor: ALMACENISTA });
    expect(fileStorage.saveFile).toHaveBeenCalledWith('receipt-documents', expect.stringMatching(/^[0-9a-f-]{36}\.pdf$/), PDF);
    expect(repo.findDocument).toHaveBeenNthCalledWith(2, 1, 4, { transaction: 'tx', lock: true });
    expect(repo.attachDocumentFile).toHaveBeenCalledWith(
      4,
      expect.objectContaining({ fileMimeType: 'application/pdf', fileSizeBytes: PDF.length, fileSha256: expect.stringMatching(/^[0-9a-f]{64}$/), fileUploadedByUserId: 7 }),
      { transaction: 'tx' }
    );
    expect(doc).toMatchObject({ label: 'FAC-0012345', file: { name: 'factura.pdf', uploadedBy: { id: 7 } } });
  });

  it('otro ALMACENISTA → FORBIDDEN_ROLE; un ADMIN sí puede', async () => {
    repo.findDocument.mockResolvedValue(stored());
    await expect(service.attachDocumentFile(1, 4, file(), { actor: { id: 99, hierarchy: 2 } })).rejects.toMatchObject({ code: 'FORBIDDEN_ROLE' });
    repo.findDocument.mockResolvedValueOnce(stored()).mockResolvedValueOnce(stored()).mockResolvedValueOnce(attached);
    await expect(service.attachDocumentFile(1, 4, file(), { actor: ADMIN })).resolves.toBeTruthy();
  });

  it('ya adjunto → DOCUMENT_FILE_EXISTS; contenido que no coincide con el tipo → DOCUMENT_FILE_INVALID; sin escribir en disco', async () => {
    repo.findDocument.mockResolvedValue(attached);
    await expect(service.attachDocumentFile(1, 4, file(), { actor: ALMACENISTA })).rejects.toMatchObject({ code: 'DOCUMENT_FILE_EXISTS' });
    repo.findDocument.mockResolvedValue(stored());
    await expect(service.attachDocumentFile(1, 4, file({ mimeType: 'image/png' }), { actor: ALMACENISTA })).rejects.toMatchObject({ code: 'DOCUMENT_FILE_INVALID' });
    await expect(service.attachDocumentFile(1, 4, file({ buffer: Buffer.alloc(0) }), { actor: ALMACENISTA })).rejects.toMatchObject({ code: 'DOCUMENT_FILE_INVALID' });
    expect(fileStorage.saveFile).not.toHaveBeenCalled();
  });

  it('si la transacción falla (otra subida ganó la carrera), borra el archivo escrito', async () => {
    repo.findDocument.mockResolvedValueOnce(stored()).mockResolvedValueOnce(attached);
    await expect(service.attachDocumentFile(1, 4, file(), { actor: ALMACENISTA })).rejects.toMatchObject({ code: 'DOCUMENT_FILE_EXISTS' });
    const key = fileStorage.saveFile.mock.calls[0][1];
    expect(fileStorage.removeFile).toHaveBeenCalledWith('receipt-documents', key);
    expect(repo.attachDocumentFile).not.toHaveBeenCalled();
  });
});
