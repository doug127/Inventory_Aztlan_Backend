// Integración del kardex de un producto (HU-409) sobre inventory_test con la app real. Registra por la
// API una entrada atrasada, una orden de retiro con activo, un traslado, un ajuste y una corrección del
// mismo producto (COMB-998x 'test.*'). user_flow.md §10: entradas, salidas y saldo acumulado, en un
// almacén o en todos, con rango de fechas; el saldo final cuadra con la tabla stock.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { QueryTypes } from 'sequelize';
import app from '#src/app.js';
import { sequelize } from '#src/config/database.js';
import { startServer } from '../../helpers/http.js';
import { assertTestDatabase, createTestUser, deleteTestUsers } from '../../helpers/db.js';

let api;
const tokens = {};
const ids = {};
const docs = {};

const one = async (sql, replacements) => (await sequelize.query(sql, { replacements, type: QueryTypes.SELECT }))[0];
const tokenOf = async (user) =>
  (await api.post('/api/auth/login', { body: { username: user.username, password: user.password } })).body.data.accessToken;
const post = async (path, body, token = tokens.admin) => {
  const res = await api.post(`/api/movements/${path}`, { token, body });
  expect(res.status).toBe(201);
  return res.body.data;
};
const kardex = (query, token = tokens.usuario) => api.get(`/api/stock/kardex?productId=${ids.diesel}&${query}`, { token });
const rows = (res) => res.body.data.map((r) => [r.movement.documentNumber, r.warehouse.code, r.in, r.out, r.balance]);
const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const stockOf = async (warehouseId) =>
  (await one('SELECT quantity::text AS q FROM stock WHERE product_id = :productId AND warehouse_id = :warehouseId', { productId: ids.diesel, warehouseId })).q;

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
  await sequelize.query("DELETE FROM assets WHERE code = 'ZX-01' AND name LIKE 'test.%'");
};

beforeAll(async () => {
  assertTestDatabase();
  await cleanup();
  await deleteTestUsers();
  api = await startServer(app);
  tokens.admin = await tokenOf(await createTestUser({ name: 'kx.admin', roleCode: 'ADMIN' }));
  tokens.usuario = await tokenOf(await createTestUser({ name: 'kx.usr', roleCode: 'USUARIO' }));

  ids.comb = (await one("SELECT id FROM warehouses WHERE code = 'COMB'")).id;
  ids.prin = (await one("SELECT id FROM warehouses WHERE code = 'PRIN'")).id;
  ids.diesel = (
    await one(
      `INSERT INTO products (code, name, product_category_id, unit_id, min_stock)
       VALUES ('COMB-9981', 'test.Diésel del kardex', (SELECT id FROM product_categories WHERE code = 'COMB'), (SELECT id FROM units WHERE code = 'L'), 0) RETURNING id`
    )
  ).id;
  ids.asset = (
    await one("INSERT INTO assets (code, name, asset_category_id) VALUES ('ZX-01', 'test.Tractor del kardex', (SELECT id FROM asset_categories WHERE code = 'TRACTOR')) RETURNING id")
  ).id;

  // La entrada, hace 10 días al mediodía (lejos de la medianoche en cualquier zona horaria).
  docs.day = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
  docs.day.setHours(12, 0, 0, 0);
  docs.entry = await post('entries', {
    warehouseId: ids.comb,
    reason: 'COMPRA',
    movementDate: docs.day.toISOString(),
    note: 'test.Compra cargada tarde',
    lines: [{ productId: ids.diesel, quantity: 1000 }],
  });
  docs.withdrawal = await post('withdrawals', { warehouseId: ids.comb, reason: 'CONSUMO', lines: [{ productId: ids.diesel, quantity: 200, assetId: ids.asset }] });
  docs.transfer = await post('transfers', { warehouseFromId: ids.comb, warehouseToId: ids.prin, lines: [{ productId: ids.diesel, quantity: 100 }] });
  docs.adjustment = await post('adjustments', {
    warehouseId: ids.prin,
    kind: 'FALTANTE',
    reference: 'CF-2026-030',
    note: 'test.Merma',
    lines: [{ productId: ids.diesel, quantity: 5.5 }],
  });
  const correction = await api.post(`/api/movements/${docs.withdrawal.id}/corrections`, {
    token: tokens.admin,
    body: { note: 'test.Se retiró de más', lines: [{ lineId: docs.withdrawal.lines[0].id, quantity: 20 }] },
  });
  expect(correction.status).toBe(201);
  docs.correction = correction.body.data;
});

afterAll(async () => {
  await api?.close();
  await cleanup();
  await deleteTestUsers();
  await sequelize.close();
});

describe('Kardex de un producto (GET /api/stock/kardex)', () => {
  it('todos los almacenes: entradas, salidas y saldo acumulado; el traslado sale de un almacén y entra al otro', async () => {
    const res = await kardex('');
    expect(res.status).toBe(200);
    expect(rows(res)).toEqual([
      [docs.entry.documentNumber, 'COMB', '1000.000', null, '1000.000'],
      [docs.withdrawal.documentNumber, 'COMB', null, '200.000', '800.000'],
      [docs.transfer.documentNumber, 'COMB', null, '100.000', '700.000'],
      [docs.transfer.documentNumber, 'PRIN', '100.000', null, '800.000'],
      [docs.adjustment.documentNumber, 'PRIN', null, '5.500', '794.500'],
      [docs.correction.documentNumber, 'COMB', '20.000', null, '814.500'],
    ]);
    expect(res.body.data[1]).toMatchObject({ movement: { movementType: 'OUT', reason: 'CONSUMO' }, asset: { code: 'ZX-01' } });
    expect(res.body.data[5].movement.reference).toBe(`REV-${docs.withdrawal.documentNumber}`);
    expect(res.body.meta.summary).toMatchObject({
      product: { code: 'COMB-9981', unitCode: 'L' },
      warehouse: null,
      opening: '0.000',
      in: '1120.000',
      out: '305.500',
      closing: '814.500',
    });
    expect(Number(await stockOf(ids.comb)) + Number(await stockOf(ids.prin))).toBe(814.5);
  });

  it('un almacén: solo sus movimientos y su saldo, que cuadra con stock', async () => {
    const comb = await kardex(`warehouseId=${ids.comb}`);
    expect(rows(comb).map((r) => r[4])).toEqual(['1000.000', '800.000', '700.000', '720.000']);
    expect(comb.body.meta.summary).toMatchObject({ warehouse: { code: 'COMB' }, closing: '720.000' });
    expect(await stockOf(ids.comb)).toBe('720.000');
    const prin = await kardex(`warehouseId=${ids.prin}`);
    expect(rows(prin)).toEqual([
      [docs.transfer.documentNumber, 'PRIN', '100.000', null, '100.000'],
      [docs.adjustment.documentNumber, 'PRIN', null, '5.500', '94.500'],
    ]);
    expect(await stockOf(ids.prin)).toBe('94.500');
  });

  it('rango de fechas: saldo inicial de lo anterior y los saldos de cada fila siguen siendo los reales', async () => {
    const nextDay = isoDay(new Date(docs.day.getTime() + 24 * 60 * 60 * 1000));
    const res = await kardex(`from=${nextDay}`);
    expect(rows(res).map((r) => r[4])).toEqual(['800.000', '700.000', '800.000', '794.500', '814.500']);
    expect(res.body.meta.summary).toMatchObject({ opening: '1000.000', in: '120.000', out: '305.500', closing: '814.500' });
    const onlyEntryDay = await kardex(`from=${isoDay(docs.day)}&to=${isoDay(docs.day)}`);
    expect(rows(onlyEntryDay)).toEqual([[docs.entry.documentNumber, 'COMB', '1000.000', null, '1000.000']]);
    expect(onlyEntryDay.body.meta.summary).toMatchObject({ opening: '0.000', closing: '1000.000' });
  });

  it('paginación: el saldo de la página 2 continúa el de la página 1', async () => {
    const page2 = await kardex('limit=4&page=2');
    expect(rows(page2).map((r) => r[4])).toEqual(['794.500', '814.500']);
    expect(page2.body.meta.pagination).toMatchObject({ totalItems: 6, totalPages: 2 });
  });

  it('sin productId → 400; producto o almacén inexistente → 404; sin sesión → 401', async () => {
    const missing = await api.get('/api/stock/kardex', { token: tokens.usuario });
    expect(missing.status).toBe(400);
    expect(missing.body.error.details).toEqual([expect.objectContaining({ path: 'productId' })]);
    expect((await api.get('/api/stock/kardex?productId=99999999', { token: tokens.usuario })).status).toBe(404);
    expect((await kardex('warehouseId=99999999')).status).toBe(404);
    expect((await kardex('from=2026-11-20&to=2026-11-01')).status).toBe(400);
    expect((await api.get(`/api/stock/kardex?productId=${ids.diesel}`)).status).toBe(401);
  });
});
