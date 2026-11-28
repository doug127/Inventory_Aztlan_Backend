// Integración de las correcciones con un movimiento inverso (HU-406) sobre inventory_test con la app
// real. Crea sus propios productos (COMB-996x 'test.*') y activos (ZQ-0x); el stock inicial nace de
// entradas. Reglas de business_rules.md §5: solo ADMIN y SUPERADMIN, referencia REV-{documento}, el
// inverso de cada tipo, no corregir más de lo que queda por línea y una corrección no se corrige.
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
const docs = {};

const BASE = '/api/movements';
const one = async (sql, replacements) => (await sequelize.query(sql, { replacements, type: QueryTypes.SELECT }))[0];
const tokenOf = async (user) =>
  (await api.post('/api/auth/login', { body: { username: user.username, password: user.password } })).body.data.accessToken;
const stockOf = async (productId, warehouseId) =>
  (await one('SELECT quantity::text AS q FROM stock WHERE product_id = :productId AND warehouse_id = :warehouseId', { productId, warehouseId }))?.q ?? null;

const post = async (path, body, token = tokens.almacenista) => {
  const res = await api.post(`${BASE}/${path}`, { token, body });
  expect(res.status).toBe(201);
  return res.body.data;
};
const correct = (movement, lines, { token = tokens.admin, key, note = 'test.Se registró de más', ...rest } = {}) =>
  api.post(`${BASE}/${movement.id}/corrections`, { token, body: { note, lines, ...rest }, headers: key ? { 'Idempotency-Key': key } : undefined });
const lineOf = (movement, productId, assetId = null) => movement.lines.find((l) => l.product.id === productId && (l.asset?.id ?? null) === assetId).id;
const detail = async (movement) => (await api.get(`${BASE}/${movement.id}`, { token: tokens.almacenista })).body.data;

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
  await sequelize.query("DELETE FROM assets WHERE code LIKE 'ZQ-%' AND name LIKE 'test.%'");
};

beforeAll(async () => {
  assertTestDatabase();
  await cleanup();
  await deleteTestUsers();
  api = await startServer(app);
  tokens.admin = await tokenOf(await createTestUser({ name: 'cr.admin', roleCode: 'ADMIN' }));
  tokens.almacenista = await tokenOf(await createTestUser({ name: 'cr.alm', roleCode: 'ALMACENISTA' }));

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
  ids.diesel = await product('COMB-9961', 'test.Diésel corregido');
  ids.oil = await product('COMB-9962', 'test.Aceite corregido');
  const asset = async (code, name) =>
    (await one("INSERT INTO assets (code, name, asset_category_id) VALUES (:code, :name, (SELECT id FROM asset_categories WHERE code = 'TRACTOR')) RETURNING id", { code, name })).id;
  ids.t1 = await asset('ZQ-01', 'test.Tractor con consumo');
  ids.t2 = await asset('ZQ-02', 'test.Tractor con préstamo');

  docs.purchase = await post('entries', { warehouseId: ids.comb, reason: 'COMPRA', lines: [{ productId: ids.diesel, quantity: 1000 }, { productId: ids.oil, quantity: 100 }] });
  docs.consumption = await post('withdrawals', {
    warehouseId: ids.comb,
    reason: 'CONSUMO',
    lines: [{ productId: ids.diesel, quantity: 200, assetId: ids.t1 }, { productId: ids.oil, quantity: 8, assetId: ids.t1 }],
  });
});

afterAll(async () => {
  await api?.close();
  await cleanup();
  await deleteTestUsers();
  await sequelize.close();
});

describe('Corrección de una orden de retiro (consumo)', () => {
  it('IN OTRO al mismo almacén con el mismo activo y REV-RET-…; el original muestra su corrección y lo corregido por línea', async () => {
    const before = await stockOf(ids.diesel, ids.comb);
    const res = await correct(docs.consumption, [{ lineId: lineOf(docs.consumption, ids.diesel, ids.t1), quantity: 50 }]);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      movementType: 'IN',
      reason: 'OTRO',
      reference: `REV-${docs.consumption.documentNumber}`,
      toWarehouse: { code: 'COMB' },
      note: 'test.Se registró de más',
      correctionOf: { id: docs.consumption.id, documentNumber: docs.consumption.documentNumber },
    });
    expect(res.body.data.lines).toEqual([expect.objectContaining({ quantity: '50.000', asset: expect.objectContaining({ code: 'ZQ-01' }) })]);
    expect(Number(await stockOf(ids.diesel, ids.comb))).toBe(Number(before) + 50);

    const original = await detail(docs.consumption);
    expect(original.corrections).toEqual([expect.objectContaining({ id: res.body.data.id, documentNumber: res.body.data.documentNumber })]);
    expect(original.lines.map((l) => [l.product.code, l.quantity, l.corrected])).toEqual([
      ['COMB-9961', '200.000', '50.000'],
      ['COMB-9962', '8.000', '0.000'],
    ]);
    docs.firstCorrection = res.body.data;
  });

  it('no corrige más de lo que queda en la línea (200 − 50 = 150) → 409 CORRECTION_EXCEEDS_ORIGINAL', async () => {
    const res = await correct(docs.consumption, [{ lineId: lineOf(docs.consumption, ids.diesel, ids.t1), quantity: 150.001 }]);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CORRECTION_EXCEEDS_ORIGINAL');
    expect(res.body.error.details).toEqual([expect.objectContaining({ path: 'lines.0.quantity', available: '150.000', requested: '150.001' })]);
  });

  it('5 correcciones simultáneas de 40 L sobre los 150 L que quedan: se registran exactamente 3', async () => {
    const lineId = lineOf(docs.consumption, ids.diesel, ids.t1);
    const results = await Promise.all(Array.from({ length: 5 }, () => correct(docs.consumption, [{ lineId, quantity: 40 }])));
    expect(results.filter((r) => r.status === 201)).toHaveLength(3);
    expect(results.filter((r) => r.status === 409 && r.body.error.code === 'CORRECTION_EXCEEDS_ORIGINAL')).toHaveLength(2);
    const original = await detail(docs.consumption);
    expect(original.lines[0].corrected).toBe('170.000');
    expect(original.corrections).toHaveLength(4);
  });

  it('la misma Idempotency-Key no corrige dos veces', async () => {
    const key = randomUUID();
    const lines = [{ lineId: lineOf(docs.consumption, ids.oil, ids.t1), quantity: 1 }];
    const [a, b] = await Promise.all([correct(docs.consumption, lines, { key }), correct(docs.consumption, lines, { key })]);
    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect((await detail(docs.consumption)).lines[1].corrected).toBe('1.000');
  });
});

describe('El inverso de cada tipo (business_rules.md §5)', () => {
  it('entrada de más → OUT OTRO desde el mismo almacén; si ya no hay existencia → INSUFFICIENT_STOCK', async () => {
    const purchase = await post('entries', { warehouseId: ids.prin, reason: 'COMPRA', lines: [{ productId: ids.oil, quantity: 30 }] });
    const res = await correct(purchase, [{ lineId: purchase.lines[0].id, quantity: 10 }]);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ movementType: 'OUT', reason: 'OTRO', reference: `REV-${purchase.documentNumber}`, fromWarehouse: { code: 'PRIN' } });
    expect(await stockOf(ids.oil, ids.prin)).toBe('20.000');
    // Lo que queda de la entrada ya salió del almacén: no se puede revertir sin stock.
    await post('withdrawals', { warehouseId: ids.prin, reason: 'CONSUMO', lines: [{ productId: ids.oil, quantity: 15, assetId: ids.t1 }] });
    const short = await correct(purchase, [{ lineId: purchase.lines[0].id, quantity: 10 }]);
    expect(short.body.error.code).toBe('INSUFFICIENT_STOCK');
  });

  it('traslado al almacén equivocado → TRANSFER de destino a origen', async () => {
    const transfer = await post('transfers', { warehouseFromId: ids.comb, warehouseToId: ids.prin, lines: [{ productId: ids.diesel, quantity: 20 }] });
    const before = { comb: await stockOf(ids.diesel, ids.comb), prin: await stockOf(ids.diesel, ids.prin) };
    const res = await correct(transfer, [{ lineId: transfer.lines[0].id, quantity: 20 }]);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ movementType: 'TRANSFER', reference: `REV-${transfer.documentNumber}`, fromWarehouse: { code: 'PRIN' }, toWarehouse: { code: 'COMB' } });
    expect(Number(await stockOf(ids.diesel, ids.comb))).toBe(Number(before.comb) + 20);
    expect(Number(await stockOf(ids.diesel, ids.prin))).toBe(Number(before.prin) - 20);
  });

  it('ajuste sobrante → ajuste faltante con REV-AJU- (acepta el CHECK de la base)', async () => {
    const surplus = await post('adjustments', { warehouseId: ids.comb, kind: 'SOBRANTE', reference: 'CF-2026-010', note: 'test.Conteo', lines: [{ productId: ids.oil, quantity: 4 }] }, tokens.admin);
    const res = await correct(surplus, [{ lineId: surplus.lines[0].id, quantity: 4 }]);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ movementType: 'ADJUST', reference: `REV-${surplus.documentNumber}`, fromWarehouse: { code: 'COMB' }, toWarehouse: null });
  });

  it('préstamo de más → IN DEVOLUCION, que baja lo pendiente y no puede superarlo', async () => {
    const loan = await post('withdrawals', { warehouseId: ids.comb, reason: 'PRESTAMO', receivedBy: 'test.Operador', lines: [{ productId: ids.oil, quantity: 5, assetId: ids.t2 }] });
    const res = await correct(loan, [{ lineId: loan.lines[0].id, quantity: 2 }]);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ movementType: 'IN', reason: 'DEVOLUCION', reference: `REV-${loan.documentNumber}` });
    const pending = (await api.get(`${BASE}/loans/pending?assetId=${ids.t2}`, { token: tokens.almacenista })).body.data;
    expect(pending).toEqual([expect.objectContaining({ pending: '3.000' })]);
    // Ya devolvió 3 por su cuenta: no queda nada pendiente que corregir con una devolución.
    await post('entries', { warehouseId: ids.comb, reason: 'DEVOLUCION', lines: [{ productId: ids.oil, quantity: 3, assetId: ids.t2 }] });
    expect((await correct(loan, [{ lineId: loan.lines[0].id, quantity: 1 }])).body.error.code).toBe('RETURN_EXCEEDS_LOAN');
  });
});

describe('Validaciones de la corrección', () => {
  it('una corrección no se corrige → 409 CORRECTION_NOT_ALLOWED', async () => {
    const res = await correct(docs.firstCorrection, [{ lineId: docs.firstCorrection.lines[0].id, quantity: 1 }]);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CORRECTION_NOT_ALLOWED');
  });

  it('sin observación, sin líneas o con una línea de otro movimiento → 400; movimiento inexistente → 404', async () => {
    const lineId = lineOf(docs.consumption, ids.oil, ids.t1);
    const noNote = await correct(docs.consumption, [{ lineId, quantity: 1 }], { note: ' ' });
    expect(noNote.status).toBe(400);
    expect(noNote.body.error.details).toEqual([expect.objectContaining({ path: 'note' })]);
    expect((await correct(docs.consumption, [])).body.error.code).toBe('EMPTY_MOVEMENT');
    const foreign = await correct(docs.consumption, [{ lineId: docs.purchase.lines[0].id, quantity: 1 }]);
    expect(foreign.status).toBe(400);
    expect(foreign.body.error.details).toEqual([expect.objectContaining({ path: 'lines.0.lineId' })]);
    expect((await correct({ id: 99999999 }, [{ lineId, quantity: 1 }])).status).toBe(404);
  });

  it('ALMACENISTA → 403 FORBIDDEN_ROLE; sin sesión → 401', async () => {
    const res = await correct(docs.consumption, [{ lineId: lineOf(docs.consumption, ids.oil, ids.t1), quantity: 1 }], { token: tokens.almacenista });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
    expect((await api.post(`${BASE}/${docs.consumption.id}/corrections`, { body: {} })).status).toBe(401);
  });

  it('v_kardex cuadra con stock después de todas las correcciones', async () => {
    const rows = await sequelize.query(
      `SELECT sum(k.delta)::text AS kardex, s.quantity::text AS stock
       FROM v_kardex k JOIN stock s ON s.product_id = k.product_id AND s.warehouse_id = k.warehouse_id
       WHERE k.product_id IN (:productIds)
       GROUP BY k.product_id, k.warehouse_id, s.quantity`,
      { replacements: { productIds: [ids.diesel, ids.oil] }, type: QueryTypes.SELECT }
    );
    expect(rows.length).toBe(4);
    for (const row of rows) expect(row.kardex).toBe(row.stock);
  });
});
