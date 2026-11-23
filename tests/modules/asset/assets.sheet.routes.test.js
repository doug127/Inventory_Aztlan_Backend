// Integración de la ficha del activo (HU-304) sobre inventory_test: consumo neto por producto e
// historial de movimientos. Crea un tractor de prueba (ZH-01) con un escenario fijo de movimientos:
//   2026-10-05  RET  CONSUMO      P1 200
//   2026-11-02  RET  CONSUMO      P1 150
//   2026-11-03  ENT  OTRO REV-    P1  50   ← corrección: resta del consumo
//   2026-11-04  RET  CONSUMO      P2   4
//   2026-11-05  RET  PRESTAMO     P2   3
//   2026-11-06  ENT  DEVOLUCION   P2   1   → préstamo pendiente: 2
//   2026-11-07  ENT  OTRO (FACT)  P1  10   ← sin REV-: no cuenta como corrección
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { QueryTypes } from 'sequelize';
import app from '#src/app.js';
import { sequelize } from '#src/config/database.js';
import { startServer } from '../../helpers/http.js';
import { assertTestDatabase, createTestUser, deleteTestUsers } from '../../helpers/db.js';

let api;
let usuario;
let adminUser;
let documentSeq = 970000;
const ids = {};

const BASE = '/api/assets';
const NOTE = 'test.movimiento ficha';
const tokenOf = async (user) =>
  (await api.post('/api/auth/login', { body: { username: user.username, password: user.password } })).body.data.accessToken;
const one = async (sql, replacements) => (await sequelize.query(sql, { replacements, type: QueryTypes.SELECT }))[0];

const addMovement = async ({ type, reason, product, quantity, date, reference = null }) => {
  documentSeq += 1;
  const isOut = type === 'OUT';
  const header = await one(
    `INSERT INTO movement_headers (document_number, movement_type, reason, reference, movement_date, created_by_user_id,
                                   warehouse_from_id, warehouse_to_id, received_by, note)
     VALUES (:doc, :type, :reason, :reference, :date, :userId, :from, :to, :receivedBy, :note) RETURNING id`,
    {
      doc: `${isOut ? 'RET' : 'ENT'}-${documentSeq}`,
      type,
      reason,
      reference,
      date: `${date}T12:00:00`,
      userId: adminUser.id,
      from: isOut ? ids.warehouse : null,
      to: isOut ? null : ids.warehouse,
      receivedBy: reason === 'PRESTAMO' ? 'test.responsable' : null,
      note: NOTE,
    }
  );
  await sequelize.query('INSERT INTO movement_lines (movement_header_id, product_id, quantity, asset_id) VALUES (:headerId, :product, :quantity, :assetId)', {
    replacements: { headerId: header.id, product, quantity, assetId: ids.asset },
  });
};

/** Los movimientos son inmutables: el trigger se apaga solo durante el borrado y solo en *_test. */
const cleanup = async () => {
  assertTestDatabase();
  await sequelize.transaction(async (transaction) => {
    const q = (sql) => sequelize.query(sql, { transaction });
    await q('ALTER TABLE movement_lines DISABLE TRIGGER trg_movements_immutable');
    await q('ALTER TABLE movement_headers DISABLE TRIGGER trg_movements_immutable');
    await q(`DELETE FROM movement_lines WHERE movement_header_id IN (SELECT id FROM movement_headers WHERE note = '${NOTE}')`);
    await q(`DELETE FROM movement_headers WHERE note = '${NOTE}'`);
    await q('ALTER TABLE movement_lines ENABLE TRIGGER trg_movements_immutable');
    await q('ALTER TABLE movement_headers ENABLE TRIGGER trg_movements_immutable');
  });
  await sequelize.query("DELETE FROM assets WHERE code = 'ZH-01' AND name LIKE 'test.%'");
};

beforeAll(async () => {
  assertTestDatabase();
  await cleanup();
  await deleteTestUsers();
  api = await startServer(app);
  adminUser = await createTestUser({ name: 'sh.admin', roleCode: 'ADMIN' });
  usuario = await tokenOf(await createTestUser({ name: 'sh.usr', roleCode: 'USUARIO' }));
  ids.warehouse = (await one("SELECT id FROM warehouses WHERE code = 'COMB'")).id;
  const [p1, p2] = await sequelize.query('SELECT id, code FROM products ORDER BY id LIMIT 2', { type: QueryTypes.SELECT });
  ids.p1 = p1.id;
  ids.p2 = p2.id;
  ids.asset = (
    await one(
      "INSERT INTO assets (code, name, asset_category_id) VALUES ('ZH-01', 'test.Ficha tractor', (SELECT id FROM asset_categories WHERE code = 'TRACTOR')) RETURNING id"
    )
  ).id;

  await addMovement({ type: 'OUT', reason: 'CONSUMO', product: ids.p1, quantity: 200, date: '2026-10-05' });
  await addMovement({ type: 'OUT', reason: 'CONSUMO', product: ids.p1, quantity: 150, date: '2026-11-02' });
  await addMovement({ type: 'IN', reason: 'OTRO', product: ids.p1, quantity: 50, date: '2026-11-03', reference: 'REV-RET-970002' });
  await addMovement({ type: 'OUT', reason: 'CONSUMO', product: ids.p2, quantity: 4, date: '2026-11-04' });
  await addMovement({ type: 'OUT', reason: 'PRESTAMO', product: ids.p2, quantity: 3, date: '2026-11-05' });
  await addMovement({ type: 'IN', reason: 'DEVOLUCION', product: ids.p2, quantity: 1, date: '2026-11-06' });
  await addMovement({ type: 'IN', reason: 'OTRO', product: ids.p1, quantity: 10, date: '2026-11-07', reference: 'FACT-123' });
});

afterAll(async () => {
  await api?.close();
  await cleanup();
  await deleteTestUsers();
  await sequelize.close();
});

const byProduct = (consumption) => Object.fromEntries(consumption.map((c) => [c.product.id, c]));

describe('GET /:id/consumption — consumo neto por producto', () => {
  it('todo el historial: neto = consumido − corregido (REV-); el IN OTRO sin REV- no resta; préstamo pendiente aparte', async () => {
    const res = await api.get(`${BASE}/${ids.asset}/consumption`, { token: usuario });
    expect(res.status).toBe(200);
    const { asset, consumption, pendingLoans, activity, period } = res.body.data;
    expect(asset).toMatchObject({ code: 'ZH-01', category: { code: 'TRACTOR' } });
    expect(period).toEqual({ from: null, to: null });
    expect(activity.lines).toBe(7);
    // Ordenado por consumo neto, de mayor a menor.
    expect(consumption.map((c) => c.product.id)).toEqual([ids.p1, ids.p2]);
    const rows = byProduct(consumption);
    expect(rows[ids.p1]).toMatchObject({ consumed: '350.000', corrected: '50.000', net: '300.000', lines: 3 });
    expect(rows[ids.p2]).toMatchObject({ consumed: '4.000', corrected: '0.000', net: '4.000', lines: 1 });
    expect(pendingLoans).toEqual([expect.objectContaining({ pending: '2.000' })]);
  });

  it('con período: noviembre solo cuenta 150 − 50; to con solo la fecha incluye ese día', async () => {
    const november = await api.get(`${BASE}/${ids.asset}/consumption?from=2026-11-01&to=2026-11-30`, { token: usuario });
    expect(byProduct(november.body.data.consumption)[ids.p1]).toMatchObject({ consumed: '150.000', corrected: '50.000', net: '100.000' });
    const untilOct5 = await api.get(`${BASE}/${ids.asset}/consumption?to=2026-10-05`, { token: usuario });
    expect(untilOct5.body.data.consumption).toEqual([expect.objectContaining({ consumed: '200.000', net: '200.000' })]);
  });

  it('activo inexistente → 404; from posterior a to → 400; sin sesión → 401', async () => {
    const missing = await api.get(`${BASE}/999999/consumption`, { token: usuario });
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('NOT_FOUND');
    const reversed = await api.get(`${BASE}/${ids.asset}/consumption?from=2026-11-30&to=2026-11-01`, { token: usuario });
    expect(reversed.status).toBe(400);
    expect(reversed.body.error.code).toBe('VALIDATION_ERROR');
    expect((await api.get(`${BASE}/${ids.asset}/consumption`)).status).toBe(401);
  });
});

describe('GET /:id/history — historial de movimientos del activo', () => {
  it('todas las líneas, de la más reciente a la más antigua, con su clase y su efecto en el consumo', async () => {
    const res = await api.get(`${BASE}/${ids.asset}/history`, { token: usuario });
    expect(res.status).toBe(200);
    expect(res.body.meta.pagination.totalItems).toBe(7);
    expect(res.body.data.map((l) => l.kind)).toEqual(['OTRO', 'DEVOLUCION', 'PRESTAMO', 'CONSUMO', 'CORRECCION', 'CONSUMO', 'CONSUMO']);
    const correction = res.body.data.find((l) => l.kind === 'CORRECCION');
    expect(correction).toMatchObject({
      quantity: '50.000',
      consumptionEffect: '-50.000',
      movement: { reference: 'REV-RET-970002', movementType: 'IN', reason: 'OTRO', warehouse: { code: 'COMB' } },
    });
    expect(res.body.data.find((l) => l.kind === 'PRESTAMO')).toMatchObject({ consumptionEffect: '0.000', movement: { receivedBy: 'test.responsable' } });
    expect(res.body.data[0].movement.createdBy.fullName).toEqual(expect.any(String));
  });

  it('filtros por clase, producto y período, con paginación', async () => {
    const kinds = await api.get(`${BASE}/${ids.asset}/history?kind=consumo,correccion`, { token: usuario });
    expect(kinds.body.data.map((l) => l.consumptionEffect)).toEqual(['4.000', '-50.000', '150.000', '200.000']);
    expect(kinds.body.meta.filters.kind).toEqual(['CONSUMO', 'CORRECCION']);
    const product = await api.get(`${BASE}/${ids.asset}/history?productId=${ids.p2}`, { token: usuario });
    expect(product.body.data.map((l) => l.kind)).toEqual(['DEVOLUCION', 'PRESTAMO', 'CONSUMO']);
    const october = await api.get(`${BASE}/${ids.asset}/history?from=2026-10-01&to=2026-10-31`, { token: usuario });
    expect(october.body.data).toHaveLength(1);
    const page2 = await api.get(`${BASE}/${ids.asset}/history?limit=3&page=3`, { token: usuario });
    expect(page2.body.data).toHaveLength(1);
    expect(page2.body.meta.pagination).toMatchObject({ page: 3, totalPages: 3, totalItems: 7 });
  });

  it('clase desconocida → 400; activo inexistente → 404', async () => {
    const bad = await api.get(`${BASE}/${ids.asset}/history?kind=VENTA`, { token: usuario });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
    expect((await api.get(`${BASE}/999999/history`, { token: usuario })).status).toBe(404);
  });
});
