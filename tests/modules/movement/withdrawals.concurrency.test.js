// HU-411: dos retiros simultáneos no dejan el stock negativo (business_rules.md P3, P4 y P5).
// Integración sobre inventory_test con la app real y solicitudes HTTP concurrentes. Crea sus propios
// productos (COMB-999x 'test.*') y activos (ZY-0x); el stock nace de entradas por la API.
//  1. Criterio de scrum_plan.md §6: 20 retiros simultáneos de 10 L sobre 100 L → exactamente 10
//     registrados, 10 rechazados con INSUFFICIENT_STOCK, stock final 0, RET- y referencias sin huecos.
//  2. Órdenes con dos productos escritos en orden opuesto, a la vez: las filas se bloquean en orden
//     ascendente de producto, así que no hay deadlock.
//  3. Retiros, entradas y traslados del mismo producto y almacén a la vez: nunca negativo, saldo exacto.
//  4. La última barrera: el CHECK de stock rechaza un negativo aunque no pase por el service.
//  5. Conciliación: Σ v_kardex por producto y almacén = stock.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { QueryTypes } from 'sequelize';
import app from '#src/app.js';
import { sequelize } from '#src/config/database.js';
import { startServer } from '../../helpers/http.js';
import { assertTestDatabase, createTestUser, deleteTestUsers } from '../../helpers/db.js';

let api;
const tokens = {};
const ids = {};

const BASE = '/api/movements';
const one = async (sql, replacements) => (await sequelize.query(sql, { replacements, type: QueryTypes.SELECT }))[0];
const tokenOf = async (user) =>
  (await api.post('/api/auth/login', { body: { username: user.username, password: user.password } })).body.data.accessToken;
const stockOf = async (productId, warehouseId = ids.comb) =>
  (await one('SELECT quantity::text AS q FROM stock WHERE product_id = :productId AND warehouse_id = :warehouseId', { productId, warehouseId }))?.q ?? null;
const post = (path, body) => api.post(`${BASE}/${path}`, { token: tokens.almacenista, body });
const enter = async (productId, quantity, warehouseId = ids.comb) =>
  expect((await post('entries', { warehouseId, reason: 'COMPRA', lines: [{ productId, quantity }] })).status).toBe(201);
const withdraw = (lines, warehouseId = ids.comb) => post('withdrawals', { warehouseId, reason: 'CONSUMO', lines });
const consecutive = (numbers) => {
  const sorted = [...numbers].sort((a, b) => a - b);
  return new Set(sorted).size === sorted.length && sorted.at(-1) - sorted[0] === sorted.length - 1;
};

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
  await sequelize.query("DELETE FROM assets WHERE code LIKE 'ZY-%' AND name LIKE 'test.%'");
};

beforeAll(async () => {
  assertTestDatabase();
  await cleanup();
  await deleteTestUsers();
  api = await startServer(app);
  tokens.almacenista = await tokenOf(await createTestUser({ name: 'cc.alm', roleCode: 'ALMACENISTA' }));

  ids.comb = (await one("SELECT id FROM warehouses WHERE code = 'COMB'")).id;
  ids.prin = (await one("SELECT id FROM warehouses WHERE code = 'PRIN'")).id;
  const product = async (code, name) =>
    (
      await one(
        `INSERT INTO products (code, name, product_category_id, unit_id, min_stock)
         VALUES (:code, :name, (SELECT id FROM product_categories WHERE code = 'COMB'), (SELECT id FROM units WHERE code = 'L'), 0) RETURNING id`,
        { code, name }
      )
    ).id;
  ids.diesel = await product('COMB-9991', 'test.Diésel en carrera');
  ids.oil = await product('COMB-9992', 'test.Aceite en carrera');
  ids.grease = await product('COMB-9993', 'test.Grasa en carrera');
  ids.mixed = await product('COMB-9994', 'test.Gasolina mixta');
  const asset = async (code, name) =>
    (await one("INSERT INTO assets (code, name, asset_category_id) VALUES (:code, :name, (SELECT id FROM asset_categories WHERE code = 'TRACTOR')) RETURNING id", { code, name })).id;
  ids.t1 = await asset('ZY-01', 'test.Tractor uno');
  ids.t2 = await asset('ZY-02', 'test.Tractor dos');
});

afterAll(async () => {
  await api?.close();
  await cleanup();
  await deleteTestUsers();
  await sequelize.close();
});

describe('HU-411: retiros simultáneos sin stock negativo', () => {
  it('20 retiros simultáneos de 10 L sobre 100 L: exactamente 10 registrados, 10 rechazados y stock 0', async () => {
    await enter(ids.diesel, 100);
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => withdraw([{ productId: ids.diesel, quantity: 10, assetId: i % 2 ? ids.t1 : ids.t2 }]))
    );
    const ok = results.filter((r) => r.status === 201);
    const rejected = results.filter((r) => r.status === 409);
    expect(ok).toHaveLength(10);
    expect(rejected).toHaveLength(10);
    expect(rejected.every((r) => r.body.error.code === 'INSUFFICIENT_STOCK')).toBe(true);
    // P4: el rechazo sale de la validación del service con la fila ya bloqueada (FOR UPDATE), con el
    // detalle de lo disponible; no del CHECK de la base, que es la última barrera y no trae detalle.
    for (const r of rejected) {
      expect(r.body.error.details).toEqual([expect.objectContaining({ productId: ids.diesel, available: '0.000', requested: '10.000' })]);
    }
    // Ninguna respuesta de error del servidor (500): nada de deadlocks ni errores sin traducir.
    expect(results.every((r) => r.status < 500)).toBe(true);
    expect(await stockOf(ids.diesel)).toBe('0.000');
    // P3: número y referencia dentro de la transacción; los rechazos no consumen ninguno.
    expect(consecutive(ok.map((r) => Number(r.body.data.documentNumber.slice(4))))).toBe(true);
    expect(consecutive(ok.map((r) => Number(r.body.data.reference.slice(-6))))).toBe(true);
    // Lo registrado es exactamente lo que salió: 10 órdenes de 10 L.
    const out = await one(
      `SELECT count(DISTINCT h.id)::int AS orders, COALESCE(sum(l.quantity), 0)::text AS total
       FROM movement_headers h JOIN movement_lines l ON l.movement_header_id = h.id
       WHERE h.movement_type = 'OUT' AND l.product_id = :productId`,
      { productId: ids.diesel }
    );
    expect(out).toEqual({ orders: 10, total: '100.000' });
  });

  it('órdenes con dos productos en orden opuesto, a la vez: todas se registran, sin deadlock', async () => {
    await enter(ids.oil, 100);
    await enter(ids.grease, 100);
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        withdraw(
          i % 2
            ? [{ productId: ids.oil, quantity: 2, assetId: ids.t1 }, { productId: ids.grease, quantity: 3, assetId: ids.t1 }]
            : [{ productId: ids.grease, quantity: 3, assetId: ids.t2 }, { productId: ids.oil, quantity: 2, assetId: ids.t2 }]
        )
      )
    );
    expect(results.map((r) => r.status)).toEqual(Array(12).fill(201));
    expect(await stockOf(ids.oil)).toBe('76.000');
    expect(await stockOf(ids.grease)).toBe('64.000');
  });

  it('retiros, entradas y traslados del mismo producto a la vez: nunca negativo y saldo exacto', async () => {
    await enter(ids.mixed, 50);
    const requests = [
      ...Array.from({ length: 10 }, () => withdraw([{ productId: ids.mixed, quantity: 10, assetId: ids.t1 }]).then((r) => ({ kind: 'out', r }))),
      ...Array.from({ length: 3 }, () => post('entries', { warehouseId: ids.comb, reason: 'COMPRA', lines: [{ productId: ids.mixed, quantity: 10 }] }).then((r) => ({ kind: 'in', r }))),
      ...Array.from({ length: 2 }, () =>
        post('transfers', { warehouseFromId: ids.comb, warehouseToId: ids.prin, lines: [{ productId: ids.mixed, quantity: 5 }] }).then((r) => ({ kind: 'trf', r }))
      ),
    ];
    const results = await Promise.all(requests);
    expect(results.every(({ r }) => r.status === 201 || (r.status === 409 && r.body.error.code === 'INSUFFICIENT_STOCK'))).toBe(true);
    const done = (kind) => results.filter((x) => x.kind === kind && x.r.status === 201).length;
    expect(done('in')).toBe(3);
    // 50 + 30 entrados = 80 disponibles como máximo: a lo sumo 8 retiros de 10 (menos si un traslado pasó antes).
    const expected = 50 + 10 * done('in') - 10 * done('out') - 5 * done('trf');
    expect(Number(await stockOf(ids.mixed))).toBe(expected);
    expect(expected).toBeGreaterThanOrEqual(0);
    expect(Number((await stockOf(ids.mixed, ids.prin)) ?? 0)).toBe(5 * done('trf'));
  });

  it('última barrera: la base rechaza un stock negativo aunque no pase por el service (chk_stock_quantity)', async () => {
    await expect(
      sequelize.query('UPDATE stock SET quantity = quantity - 1 WHERE product_id = :productId AND warehouse_id = :warehouseId', {
        replacements: { productId: ids.diesel, warehouseId: ids.comb },
      })
    ).rejects.toThrow(/chk_stock_quantity/);
    expect(await stockOf(ids.diesel)).toBe('0.000');
  });

  it('conciliación: Σ v_kardex por producto y almacén coincide con stock', async () => {
    const rows = await sequelize.query(
      `SELECT k.product_id, k.warehouse_id, sum(k.delta)::text AS kardex, s.quantity::text AS stock
       FROM v_kardex k JOIN stock s ON s.product_id = k.product_id AND s.warehouse_id = k.warehouse_id
       WHERE k.product_id IN (:productIds)
       GROUP BY k.product_id, k.warehouse_id, s.quantity`,
      { replacements: { productIds: [ids.diesel, ids.oil, ids.grease, ids.mixed] }, type: QueryTypes.SELECT }
    );
    expect(rows.length).toBeGreaterThanOrEqual(4);
    for (const row of rows) expect(row.kardex).toBe(row.stock);
  });
});
