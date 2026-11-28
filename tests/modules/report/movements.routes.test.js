// Integración del reporte de movimientos por período (HU-502) sobre inventory_test con la app real.
// Productos de una categoría de prueba (TSTM y su hija TSTS, 'test.*'), con movimientos registrados por la
// API en COMB y PRIN: una compra de hace 40 días, y hoy un consumo con su corrección, un traslado
// COMB → PRIN, un faltante en PRIN, un sobrante en COMB y un desecho. El neto por almacén debe ser la
// variación de su existencia y el resumen por tipo, motivo y período debe cuadrar con los documentos.
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
const idOf = async (table, code) => (await one(`SELECT id FROM ${table} WHERE code = :code`, { code })).id;
const tokenOf = async (user) =>
  (await api.post('/api/auth/login', { body: { username: user.username, password: user.password } })).body.data.accessToken;
const post = async (path, body) => {
  const res = await api.post(`/api/movements/${path}`, { token: tokens.admin, body });
  expect(res.status, JSON.stringify(res.body.error)).toBe(201);
  return res.body.data;
};
const report = (query, token = tokens.usuario) => api.get(`/api/reports/movements?${query}`, { token });
const scope = () => `productCategoryId=${ids.TSTM}`;
const daysAgo = (n) => {
  const d = new Date(Date.now() - n * 24 * 60 * 60 * 1000);
  d.setHours(12, 0, 0, 0);
  return d;
};
const pad = (n) => String(n).padStart(2, '0');
const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** [producto, entradas, salidas, traslados entrados, traslados salidos, sobrantes, faltantes, neto] de cada fila. */
const rows = (res) => res.body.data.map((r) => [r.product.code, r.entries, r.exits, r.transfersIn, r.transfersOut, r.adjustmentsIn, r.adjustmentsOut, r.net]);
const stockOf = async (productId, warehouseId) =>
  Number((await one('SELECT quantity FROM stock WHERE product_id = :productId AND warehouse_id = :warehouseId', { productId, warehouseId }))?.quantity ?? 0);

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
  await sequelize.query("DELETE FROM assets WHERE code LIKE 'ZM-%' AND name LIKE 'test.%'");
  await sequelize.query("DELETE FROM product_categories WHERE code = 'TSTS' AND name LIKE 'test.%'");
  await sequelize.query("DELETE FROM product_categories WHERE code = 'TSTM' AND name LIKE 'test.%'");
};

beforeAll(async () => {
  assertTestDatabase();
  await cleanup();
  await deleteTestUsers();
  api = await startServer(app);
  tokens.admin = await tokenOf(await createTestUser({ name: 'rm.admin', roleCode: 'ADMIN' }));
  tokens.usuario = await tokenOf(await createTestUser({ name: 'rm.usr', roleCode: 'USUARIO' }));

  ids.comb = await idOf('warehouses', 'COMB');
  ids.prin = await idOf('warehouses', 'PRIN');
  ids.TSTM = (await one("INSERT INTO product_categories (code, name) VALUES ('TSTM', 'test.Movimientos') RETURNING id")).id;
  ids.TSTS = (await one("INSERT INTO product_categories (code, name, parent_id) VALUES ('TSTS', 'test.Movimientos hija', :parent) RETURNING id", { parent: ids.TSTM })).id;
  const product = async (code, name, categoryId) =>
    (
      await one(
        `INSERT INTO products (code, name, product_category_id, unit_id, min_stock)
         VALUES (:code, :name, :categoryId, (SELECT id FROM units WHERE code = 'L'), 0) RETURNING id`,
        { code, name, categoryId }
      )
    ).id;
  ids.diesel = await product('TSTM-0001', 'test.Diésel de movimientos', ids.TSTM);
  ids.oil = await product('TSTS-0001', 'test.Aceite de movimientos', ids.TSTS);
  ids.tractor = (await one("INSERT INTO assets (code, name, asset_category_id) VALUES ('ZM-01', 'test.Tractor de movimientos', (SELECT id FROM asset_categories WHERE code = 'TRACTOR')) RETURNING id")).id;

  docs.purchase = await post('entries', {
    warehouseId: ids.comb,
    reason: 'COMPRA',
    movementDate: daysAgo(40).toISOString(),
    note: 'test.Compra cargada tarde',
    lines: [{ productId: ids.diesel, quantity: 1000 }, { productId: ids.oil, quantity: 100 }],
  });
  docs.consumption = await post('withdrawals', { warehouseId: ids.comb, reason: 'CONSUMO', lines: [{ productId: ids.diesel, quantity: 300, assetId: ids.tractor }] });
  docs.correction = await post(`${docs.consumption.id}/corrections`, { note: 'test.Se retiró de más', lines: [{ lineId: docs.consumption.lines[0].id, quantity: 50 }] });
  docs.transfer = await post('transfers', { warehouseFromId: ids.comb, warehouseToId: ids.prin, lines: [{ productId: ids.diesel, quantity: 200 }] });
  docs.shortage = await post('adjustments', { warehouseId: ids.prin, kind: 'FALTANTE', reference: 'CF-2026-090', note: 'test.Conteo', lines: [{ productId: ids.diesel, quantity: 5 }] });
  docs.surplus = await post('adjustments', { warehouseId: ids.comb, kind: 'SOBRANTE', reference: 'CF-2026-091', note: 'test.Conteo', lines: [{ productId: ids.oil, quantity: 4 }] });
  docs.waste = await post('withdrawals', { warehouseId: ids.comb, reason: 'DESECHO', note: 'test.Aceite contaminado', lines: [{ productId: ids.oil, quantity: 10 }] });
});

afterAll(async () => {
  await api?.close();
  await cleanup();
  await deleteTestUsers();
  await sequelize.close();
});

describe('Reporte de movimientos por período (GET /api/reports/movements)', () => {
  it('sin almacén: por producto, entradas, salidas, traslados (neto 0) y ajustes; el neto es la variación de la existencia total', async () => {
    const res = await report(scope());
    expect(res.status).toBe(200);
    expect(rows(res)).toEqual([
      // 1000 comprados + 50 corregidos − 300 consumidos − 5 de faltante; el traslado entra y sale.
      ['TSTM-0001', '1050.000', '300.000', '200.000', '200.000', '0.000', '5.000', '745.000'],
      ['TSTS-0001', '100.000', '10.000', '0.000', '0.000', '4.000', '0.000', '94.000'],
    ]);
    expect(res.body.data[0]).toMatchObject({ product: { name: 'test.Diésel de movimientos', unitCode: 'L' }, documents: 5, lines: 5 });
    for (const [i, productId] of [ids.diesel, ids.oil].entries()) {
      const total = (await stockOf(productId, ids.comb)) + (await stockOf(productId, ids.prin));
      expect(Number(res.body.data[i].net)).toBe(total);
    }
  });

  it('el resumen cuenta documentos por tipo, por motivo (con las correcciones REV-) y por período', async () => {
    const res = await report(scope());
    const { summary } = res.body.meta;
    expect(summary).toMatchObject({ documents: 7, lines: 8, products: 2, byType: { IN: 2, OUT: 2, TRANSFER: 1, ADJUST: 2 }, interval: 'month', warehouse: null });
    expect(summary.byReason).toEqual([
      { movementType: 'IN', reason: 'COMPRA', documents: 1, lines: 2, corrections: 0 },
      { movementType: 'IN', reason: 'OTRO', documents: 1, lines: 1, corrections: 1 },
      { movementType: 'OUT', reason: 'CONSUMO', documents: 1, lines: 1, corrections: 0 },
      { movementType: 'OUT', reason: 'DESECHO', documents: 1, lines: 1, corrections: 0 },
      { movementType: 'TRANSFER', reason: 'TRASLADO', documents: 1, lines: 1, corrections: 0 },
      { movementType: 'ADJUST', reason: 'AJUSTE', documents: 2, lines: 2, corrections: 0 },
    ]);
    // La compra de hace 40 días cae en otro mes que los movimientos de hoy.
    const month = (d) => isoDay(new Date(d.getFullYear(), d.getMonth(), 1));
    expect(summary.byPeriod).toEqual([
      { period: month(daysAgo(40)), IN: 1, OUT: 0, TRANSFER: 0, ADJUST: 0, documents: 1 },
      { period: month(new Date()), IN: 1, OUT: 2, TRANSFER: 1, ADJUST: 2, documents: 6 },
    ]);
  });

  it('por día: un punto por cada día con movimientos, en la hora del servidor', async () => {
    const res = await report(`${scope()}&interval=day`);
    expect(res.body.meta.summary.byPeriod.map((p) => [p.period, p.documents])).toEqual([
      [isoDay(daysAgo(40)), 1],
      [isoDay(new Date()), 6],
    ]);
  });

  it('con almacén: solo sus patas; el traslado sale de COMB y entra en PRIN, y el neto cuadra con su existencia', async () => {
    const comb = await report(`${scope()}&warehouseId=${ids.comb}`);
    expect(rows(comb)).toEqual([
      ['TSTM-0001', '1050.000', '300.000', '0.000', '200.000', '0.000', '0.000', '550.000'],
      ['TSTS-0001', '100.000', '10.000', '0.000', '0.000', '4.000', '0.000', '94.000'],
    ]);
    expect(comb.body.meta.summary).toMatchObject({ documents: 6, warehouse: { code: 'COMB' }, byType: { IN: 2, OUT: 2, TRANSFER: 1, ADJUST: 1 } });
    expect(Number(comb.body.data[0].net)).toBe(await stockOf(ids.diesel, ids.comb));

    const prin = await report(`${scope()}&warehouseId=${ids.prin}`);
    expect(rows(prin)).toEqual([['TSTM-0001', '0.000', '0.000', '200.000', '0.000', '0.000', '5.000', '195.000']]);
    expect(prin.body.meta.summary).toMatchObject({ documents: 2, products: 1, byType: { IN: 0, OUT: 0, TRANSFER: 1, ADJUST: 1 } });
    expect(Number(prin.body.data[0].net)).toBe(await stockOf(ids.diesel, ids.prin));
  });

  it('filtra por período (inclusive), tipo, motivo, producto y subcategoría', async () => {
    const today = isoDay(new Date());
    const period = await report(`${scope()}&from=${today}&to=${today}`);
    expect(rows(period)[0]).toEqual(['TSTM-0001', '50.000', '300.000', '200.000', '200.000', '0.000', '5.000', '-255.000']);
    expect(period.body.meta.summary.documents).toBe(6);
    expect(period.body.meta.filters).toMatchObject({ from: today, to: today, interval: 'month' });

    const before = await report(`${scope()}&to=${isoDay(daysAgo(1))}`);
    expect(before.body.meta.summary).toMatchObject({ documents: 1, byType: { IN: 1 } });

    const outs = await report(`${scope()}&movementType=OUT`);
    expect(rows(outs).map((r) => [r[0], r[2], r[7]])).toEqual([
      ['TSTM-0001', '300.000', '-300.000'],
      ['TSTS-0001', '10.000', '-10.000'],
    ]);

    const waste = await report(`${scope()}&movementType=OUT&reason=DESECHO`);
    expect(waste.body.data.map((r) => r.product.code)).toEqual(['TSTS-0001']);

    const corrections = await report(`${scope()}&reason=OTRO`);
    expect(corrections.body.meta.summary.byReason).toEqual([{ movementType: 'IN', reason: 'OTRO', documents: 1, lines: 1, corrections: 1 }]);

    const byProduct = await report(`productId=${ids.oil}`);
    expect(byProduct.body.data.map((r) => r.product.code)).toEqual(['TSTS-0001']);
    const sub = await report(`productCategoryId=${ids.TSTS}`);
    expect(sub.body.meta.summary).toMatchObject({ products: 1, documents: 3 });
  });

  it('pagina por producto sin cambiar el resumen', async () => {
    const page2 = await report(`${scope()}&limit=1&page=2`);
    expect(page2.body.data.map((r) => r.product.code)).toEqual(['TSTS-0001']);
    expect(page2.body.meta.pagination).toMatchObject({ page: 2, limit: 1, totalItems: 2, totalPages: 2 });
    expect(page2.body.meta.summary.documents).toBe(7);
  });

  it('errores: sin sesión 401, motivo de otro tipo o intervalo inválido 400, almacén o categoría inexistente 404', async () => {
    expect((await api.get('/api/reports/movements')).status).toBe(401);
    const wrongReason = await report('movementType=IN&reason=CONSUMO');
    expect(wrongReason.status).toBe(400);
    expect(wrongReason.body.error.code).toBe('VALIDATION_ERROR');
    expect((await report('interval=year')).status).toBe(400);
    expect((await report('from=2026-11-10&to=2026-11-01')).status).toBe(400);
    expect((await report('warehouseId=999999')).status).toBe(404);
    expect((await report('productCategoryId=999999')).status).toBe(404);
  });
});
