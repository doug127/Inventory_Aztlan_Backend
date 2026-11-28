// Integración de préstamos y devoluciones (HU-405) sobre inventory_test con la app real. Crea sus
// propios productos (COMB-995x 'test.*') y activos (ZK-0x). Los préstamos son órdenes de retiro con
// motivo PRESTAMO (HU-401) y las devoluciones, entradas con motivo DEVOLUCION. Reglas de
// business_rules.md §2.2 regla 3: cada línea indica el activo y lo devuelto por (activo, producto) no
// supera lo pendiente = Σ OUT PRESTAMO − Σ IN DEVOLUCION.
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { QueryTypes } from 'sequelize';
import app from '#src/app.js';
import { sequelize } from '#src/config/database.js';
import { startServer } from '../../helpers/http.js';
import { assertTestDatabase, createTestUser, deleteTestUsers } from '../../helpers/db.js';

let api;
const tokens = {};
const ids = {};
const loans = {};

const BASE = '/api/movements';
const one = async (sql, replacements) => (await sequelize.query(sql, { replacements, type: QueryTypes.SELECT }))[0];
const tokenOf = async (user) =>
  (await api.post('/api/auth/login', { body: { username: user.username, password: user.password } })).body.data.accessToken;
const stockOf = async (productId, warehouseId) =>
  (await one('SELECT quantity::text AS q FROM stock WHERE product_id = :productId AND warehouse_id = :warehouseId', { productId, warehouseId }))?.q ?? null;

const lend = async (lines, { warehouseId = ids.tall, receivedBy = 'test.Pedro Gómez' } = {}) => {
  const res = await api.post(`${BASE}/withdrawals`, { token: tokens.almacenista, body: { warehouseId, reason: 'PRESTAMO', receivedBy, lines } });
  expect(res.status).toBe(201);
  return res.body.data;
};
const giveBack = (lines, { token = tokens.almacenista, key, ...overrides } = {}) =>
  api.post(`${BASE}/entries`, {
    token,
    body: { warehouseId: ids.tall, reason: 'DEVOLUCION', lines, ...overrides },
    headers: key ? { 'Idempotency-Key': key } : undefined,
  });
const pendingList = (query = '', token = tokens.almacenista) => api.get(`${BASE}/loans/pending${query}`, { token });
/** Lo pendiente de un par (activo, producto) según el listado, o null si ya no figura. */
const pendingOf = async (assetId, productId) =>
  (await pendingList(`?assetId=${assetId}&limit=100`)).body.data.find((p) => p.product.id === productId)?.pending ?? null;

/** Los movimientos son inmutables: el trigger se apaga solo durante el borrado y solo en *_test. */
const cleanup = async () => {
  assertTestDatabase();
  await sequelize.transaction(async (transaction) => {
    const q = (sql) => sequelize.query(sql, { transaction });
    const testHeaders = `SELECT h.id FROM movement_headers h JOIN users u ON u.id = h.created_by_user_id WHERE u.username LIKE 'test.%'`;
    await q('ALTER TABLE movement_lines DISABLE TRIGGER trg_movements_immutable');
    await q('ALTER TABLE movement_headers DISABLE TRIGGER trg_movements_immutable');
    await q(`DELETE FROM movement_documents WHERE movement_header_id IN (${testHeaders})`);
    await q(`DELETE FROM movement_lines WHERE movement_header_id IN (${testHeaders})`);
    await q(`DELETE FROM movement_headers WHERE id IN (${testHeaders})`);
    await q('ALTER TABLE movement_lines ENABLE TRIGGER trg_movements_immutable');
    await q('ALTER TABLE movement_headers ENABLE TRIGGER trg_movements_immutable');
  });
  await sequelize.query("DELETE FROM stock WHERE product_id IN (SELECT id FROM products WHERE name LIKE 'test.%')");
  await sequelize.query("DELETE FROM products WHERE name LIKE 'test.%'");
  await sequelize.query("DELETE FROM assets WHERE code LIKE 'ZK-%' AND name LIKE 'test.%'");
};

beforeAll(async () => {
  assertTestDatabase();
  await cleanup();
  await deleteTestUsers();
  api = await startServer(app);
  const admin = await createTestUser({ name: 'ln.admin', roleCode: 'ADMIN' });
  const almacenista = await createTestUser({ name: 'ln.alm', roleCode: 'ALMACENISTA' });
  const usuario = await createTestUser({ name: 'ln.usr', roleCode: 'USUARIO' });
  tokens.admin = await tokenOf(admin);
  tokens.almacenista = await tokenOf(almacenista);
  tokens.usuario = await tokenOf(usuario);

  ids.tall = (await one("SELECT id FROM warehouses WHERE code = 'TALL'")).id;
  ids.prin = (await one("SELECT id FROM warehouses WHERE code = 'PRIN'")).id;
  const product = async (code, name) =>
    (
      await one(
        `INSERT INTO products (code, name, product_category_id, unit_id, min_stock)
         VALUES (:code, :name, (SELECT id FROM product_categories WHERE code = 'COMB'), (SELECT id FROM units WHERE code = 'L'), 0) RETURNING id`,
        { code, name }
      )
    ).id;
  ids.jack = await product('COMB-9951', 'test.Gato hidráulico');
  ids.drum = await product('COMB-9952', 'test.Bidón de 20 L');
  const asset = async (code, name) =>
    (await one("INSERT INTO assets (code, name, asset_category_id) VALUES (:code, :name, (SELECT id FROM asset_categories WHERE code = 'TRACTOR')) RETURNING id", { code, name })).id;
  ids.t1 = await asset('ZK-01', 'test.Tractor prestatario');
  ids.t2 = await asset('ZK-02', 'test.Tractor vecino');

  for (const productId of [ids.jack, ids.drum]) {
    const res = await api.post(`${BASE}/entries`, { token: tokens.almacenista, body: { warehouseId: ids.tall, reason: 'COMPRA', lines: [{ productId, quantity: 100 }] } });
    expect(res.status).toBe(201);
  }
  loans.first = await lend([
    { productId: ids.jack, quantity: 6, assetId: ids.t1 },
    { productId: ids.drum, quantity: 4, assetId: ids.t1 },
    { productId: ids.jack, quantity: 3, assetId: ids.t2 },
  ]);
});

afterAll(async () => {
  await api?.close();
  await cleanup();
  await deleteTestUsers();
  await sequelize.close();
});

describe('Préstamos pendientes (GET /loans/pending)', () => {
  it('uno por activo y producto, con lo prestado, lo devuelto, lo pendiente y el último préstamo; lo ve cualquier rol', async () => {
    const res = await pendingList(`?assetId=${ids.t1}`, tokens.usuario);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      expect.objectContaining({
        asset: { id: ids.t1, code: 'ZK-01', name: 'test.Tractor prestatario' },
        product: expect.objectContaining({ code: 'COMB-9951', unitCode: 'L' }),
        lent: '6.000',
        returned: '0.000',
        pending: '6.000',
        lastLoan: expect.objectContaining({ id: loans.first.id, documentNumber: loans.first.documentNumber, receivedBy: 'test.Pedro Gómez', warehouse: expect.objectContaining({ code: 'TALL' }) }),
      }),
      expect.objectContaining({ product: expect.objectContaining({ code: 'COMB-9952' }), pending: '4.000' }),
    ]);
    expect(res.body.meta.pagination).toMatchObject({ page: 1, limit: 10, totalItems: 2 });
    expect(res.body.meta.filters).toEqual({ assetId: ids.t1 });
  });

  it('filtra por préstamo (sus pares activo-producto) y por texto', async () => {
    const byLoan = await pendingList(`?movementId=${loans.first.id}`);
    expect(byLoan.body.data).toHaveLength(3);
    const bySearch = await pendingList('?search=vecino');
    expect(bySearch.body.data.map((p) => [p.asset.code, p.product.code])).toEqual([['ZK-02', 'COMB-9951']]);
    expect((await pendingList('?assetId=abc')).status).toBe(400);
  });
});

describe('Devolución (IN DEVOLUCION)', () => {
  it('una devolución parcial suma en el almacén, guarda el activo en la línea y baja lo pendiente', async () => {
    const before = await stockOf(ids.jack, ids.tall);
    const res = await giveBack([{ productId: ids.jack, quantity: 2, assetId: ids.t1 }], { reference: loans.first.documentNumber, receivedBy: 'test.Pedro Gómez' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ movementType: 'IN', reason: 'DEVOLUCION', reference: loans.first.documentNumber, toWarehouse: { code: 'TALL' } });
    expect(res.body.data.lines).toEqual([expect.objectContaining({ quantity: '2.000', asset: expect.objectContaining({ code: 'ZK-01' }) })]);
    expect(Number(await stockOf(ids.jack, ids.tall))).toBe(Number(before) + 2);
    expect(await pendingOf(ids.t1, ids.jack)).toBe('4.000');
  });

  it('lo devuelto supera lo pendiente → 409 RETURN_EXCEEDS_LOAN y no se suma nada', async () => {
    const before = await stockOf(ids.jack, ids.tall);
    const res = await giveBack([
      { productId: ids.drum, quantity: 1, assetId: ids.t1 },
      { productId: ids.jack, quantity: 3, assetId: ids.t1 },
      { productId: ids.jack, quantity: 1.5, assetId: ids.t1 },
    ]);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('RETURN_EXCEEDS_LOAN');
    expect(res.body.error.details).toEqual([expect.objectContaining({ path: 'lines.1.quantity', assetCode: 'ZK-01', productCode: 'COMB-9951', pending: '4.000', requested: '4.500' })]);
    expect(await stockOf(ids.jack, ids.tall)).toBe(before);
    expect(await pendingOf(ids.t1, ids.drum)).toBe('4.000');
  });

  it('el préstamo de un activo no se devuelve con otro activo: ZK-02 no debe bidones', async () => {
    const res = await giveBack([{ productId: ids.drum, quantity: 1, assetId: ids.t2 }]);
    expect(res.body.error.code).toBe('RETURN_EXCEEDS_LOAN');
    expect(res.body.error.message).toContain('No hay préstamo pendiente');
  });

  it('la devolución puede llegar a otro almacén; al devolver todo, el par sale del listado', async () => {
    const res = await giveBack([{ productId: ids.jack, quantity: 3, assetId: ids.t2 }], { warehouseId: ids.prin });
    expect(res.status).toBe(201);
    expect(await stockOf(ids.jack, ids.prin)).toBe('3.000');
    expect(await pendingOf(ids.t2, ids.jack)).toBeNull();
    expect((await pendingList(`?assetId=${ids.t2}`)).body.data).toEqual([]);
  });

  it('la misma Idempotency-Key no devuelve dos veces', async () => {
    const key = randomUUID();
    const lines = [{ productId: ids.drum, quantity: 1, assetId: ids.t1 }];
    const [a, b] = await Promise.all([giveBack(lines, { key }), giveBack(lines, { key })]);
    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(await pendingOf(ids.t1, ids.drum)).toBe('3.000');
  });

  it('8 devoluciones simultáneas de 1 L sobre 3 L pendientes: se registran exactamente 3', async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => giveBack([{ productId: ids.drum, quantity: 1, assetId: ids.t1 }])));
    expect(results.filter((r) => r.status === 201)).toHaveLength(3);
    expect(results.filter((r) => r.status === 409 && r.body.error.code === 'RETURN_EXCEEDS_LOAN')).toHaveLength(5);
    expect(await pendingOf(ids.t1, ids.drum)).toBeNull();
  });

  it('sin activo → ASSET_REQUIRED en la línea; con documentos de recepción → 400; USUARIO → 403', async () => {
    const noAsset = await giveBack([{ productId: ids.jack, quantity: 1 }]);
    expect(noAsset.body.error.code).toBe('ASSET_REQUIRED');
    expect(noAsset.body.error.details).toEqual([expect.objectContaining({ path: 'lines.0.assetId' })]);
    const withDocs = await giveBack([{ productId: ids.jack, quantity: 1, assetId: ids.t1 }], { documents: [{ documentType: 'FACTURA', documentNumber: '123' }] });
    expect(withDocs.status).toBe(400);
    expect(withDocs.body.error.details).toEqual([expect.objectContaining({ path: 'documents' })]);
    expect((await giveBack([{ productId: ids.jack, quantity: 1, assetId: ids.t1 }], { token: tokens.usuario })).status).toBe(403);
  });

  it('un nuevo préstamo suma a lo pendiente y la ficha del activo lo refleja; v_kardex cuadra con stock', async () => {
    await lend([{ productId: ids.jack, quantity: 5, assetId: ids.t1 }]);
    expect(await pendingOf(ids.t1, ids.jack)).toBe('9.000');
    const rows = await sequelize.query(
      `SELECT sum(k.delta)::text AS kardex, s.quantity::text AS stock
       FROM v_kardex k JOIN stock s ON s.product_id = k.product_id AND s.warehouse_id = k.warehouse_id
       WHERE k.product_id IN (:productIds)
       GROUP BY k.product_id, k.warehouse_id, s.quantity`,
      { replacements: { productIds: [ids.jack, ids.drum] }, type: QueryTypes.SELECT }
    );
    expect(rows.length).toBe(3);
    for (const row of rows) expect(row.kardex).toBe(row.stock);
  });
});
