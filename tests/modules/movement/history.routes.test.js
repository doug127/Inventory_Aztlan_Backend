// Integración del historial de movimientos (HU-408) sobre inventory_test con la app real. Crea sus
// propios usuarios, productos (COMB-997x 'test.*') y activo (ZR-01), y registra un movimiento de cada
// tipo y una corrección. Cada consulta filtra por usuario o producto de la prueba para no depender del
// resto de los datos. user_flow.md §9: del más reciente al más antiguo, filtros combinables.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { QueryTypes } from 'sequelize';
import app from '#src/app.js';
import { sequelize } from '#src/config/database.js';
import { startServer } from '../../helpers/http.js';
import { assertTestDatabase, createTestUser, deleteTestUsers } from '../../helpers/db.js';

let api;
const tokens = {};
const users = {};
const ids = {};
const docs = {};

const BASE = '/api/movements';
const one = async (sql, replacements) => (await sequelize.query(sql, { replacements, type: QueryTypes.SELECT }))[0];
const tokenOf = async (user) =>
  (await api.post('/api/auth/login', { body: { username: user.username, password: user.password } })).body.data.accessToken;
const post = async (path, body, token = tokens.almacenista) => {
  const res = await api.post(`${BASE}/${path}`, { token, body });
  expect(res.status).toBe(201);
  return res.body.data;
};
const history = (query, token = tokens.usuario) => api.get(`${BASE}?${query}`, { token });
const docsOf = (res) => res.body.data.map((m) => m.documentNumber);
const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

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
  await sequelize.query("DELETE FROM assets WHERE code = 'ZR-01' AND name LIKE 'test.%'");
};

beforeAll(async () => {
  assertTestDatabase();
  await cleanup();
  await deleteTestUsers();
  api = await startServer(app);
  users.admin = await createTestUser({ name: 'hi.admin', roleCode: 'ADMIN' });
  users.almacenista = await createTestUser({ name: 'hi.alm', roleCode: 'ALMACENISTA' });
  users.usuario = await createTestUser({ name: 'hi.usr', roleCode: 'USUARIO' });
  for (const [key, user] of Object.entries(users)) tokens[key] = await tokenOf(user);

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
  ids.diesel = await product('COMB-9971', 'test.Diésel del historial');
  ids.oil = await product('COMB-9972', 'test.Aceite del historial');
  ids.asset = (
    await one("INSERT INTO assets (code, name, asset_category_id) VALUES ('ZR-01', 'test.Tractor del historial', (SELECT id FROM asset_categories WHERE code = 'TRACTOR')) RETURNING id")
  ).id;

  // Una entrada con fecha de hace 10 días al mediodía (lejos de la medianoche en cualquier zona horaria).
  docs.tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
  docs.tenDaysAgo.setHours(12, 0, 0, 0);
  docs.entry = await post(
    'entries',
    { warehouseId: ids.comb, reason: 'COMPRA', movementDate: docs.tenDaysAgo.toISOString(), note: 'test.Compra cargada tarde', lines: [{ productId: ids.diesel, quantity: 100 }] },
    tokens.admin
  );
  docs.withdrawal = await post('withdrawals', { warehouseId: ids.comb, reason: 'CONSUMO', lines: [{ productId: ids.diesel, quantity: 30, assetId: ids.asset }] });
  docs.transfer = await post('transfers', { warehouseFromId: ids.comb, warehouseToId: ids.prin, lines: [{ productId: ids.diesel, quantity: 10 }] });
  docs.adjustment = await post(
    'adjustments',
    { warehouseId: ids.prin, kind: 'SOBRANTE', reference: 'CF-2026-020', note: 'test.Conteo', lines: [{ productId: ids.oil, quantity: 5 }] },
    tokens.admin
  );
  const correction = await api.post(`${BASE}/${docs.withdrawal.id}/corrections`, {
    token: tokens.admin,
    body: { note: 'test.Se retiró de más', lines: [{ lineId: docs.withdrawal.lines[0].id, quantity: 5 }] },
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

describe('Historial de movimientos (GET /api/movements)', () => {
  it('del más reciente al más antiguo, con la cabecera resumida; lo consulta cualquier rol', async () => {
    const res = await history(`productId=${ids.diesel}`);
    expect(res.status).toBe(200);
    expect(docsOf(res)).toEqual([docs.correction.documentNumber, docs.transfer.documentNumber, docs.withdrawal.documentNumber, docs.entry.documentNumber]);
    const withdrawal = res.body.data[2];
    expect(withdrawal).toMatchObject({
      id: docs.withdrawal.id,
      movementType: 'OUT',
      reason: 'CONSUMO',
      createdBy: { id: users.almacenista.id },
      fromWarehouse: { code: 'COMB' },
      toWarehouse: null,
      lineCount: 1,
      isCorrection: false,
      correctionCount: 1,
    });
    expect(res.body.data[0]).toMatchObject({ isCorrection: true, reference: `REV-${docs.withdrawal.documentNumber}`, correctionCount: 0 });
    expect(res.body.data[1]).toMatchObject({ fromWarehouse: { code: 'COMB' }, toWarehouse: { code: 'PRIN' } });
    expect(res.body.meta.pagination).toMatchObject({ page: 1, limit: 10, totalItems: 4 });
    expect(res.body.meta.filters).toEqual({ productId: ids.diesel });
  });

  it('por usuario, tipo y motivo', async () => {
    expect(docsOf(await history(`userId=${users.almacenista.id}`))).toEqual([docs.transfer.documentNumber, docs.withdrawal.documentNumber]);
    expect(docsOf(await history(`userId=${users.admin.id}&movementType=ADJUST`))).toEqual([docs.adjustment.documentNumber]);
    expect(docsOf(await history(`productId=${ids.diesel}&movementType=IN&reason=OTRO`))).toEqual([docs.correction.documentNumber]);
  });

  it('por almacén (origen o destino), activo y producto', async () => {
    expect(docsOf(await history(`warehouseId=${ids.prin}&userId=${users.almacenista.id}`))).toEqual([docs.transfer.documentNumber]);
    expect(docsOf(await history(`assetId=${ids.asset}`))).toEqual([docs.correction.documentNumber, docs.withdrawal.documentNumber]);
    expect(docsOf(await history(`productId=${ids.oil}`))).toEqual([docs.adjustment.documentNumber]);
  });

  it('por número de documento o referencia: el documento y sus correcciones', async () => {
    const res = await history(`search=${docs.withdrawal.documentNumber}`);
    expect(docsOf(res)).toEqual([docs.correction.documentNumber, docs.withdrawal.documentNumber]);
    expect(docsOf(await history(`search=cf-2026-020&userId=${users.admin.id}`))).toEqual([docs.adjustment.documentNumber]);
  });

  it('rango de fechas inclusive', async () => {
    const day = isoDay(docs.tenDaysAgo);
    expect(docsOf(await history(`productId=${ids.diesel}&from=${day}&to=${day}`))).toEqual([docs.entry.documentNumber]);
    const nextDay = isoDay(new Date(docs.tenDaysAgo.getTime() + 24 * 60 * 60 * 1000));
    expect(docsOf(await history(`productId=${ids.diesel}&to=${nextDay}`))).toEqual([docs.entry.documentNumber]);
    expect(docsOf(await history(`productId=${ids.diesel}&from=${nextDay}`))).toHaveLength(3);
  });

  it('paginación de a 10 por defecto y con limit', async () => {
    const page2 = await history(`productId=${ids.diesel}&limit=3&page=2`);
    expect(docsOf(page2)).toEqual([docs.entry.documentNumber]);
    expect(page2.body.meta.pagination).toMatchObject({ totalItems: 4, totalPages: 2, hasPrevPage: true, hasNextPage: false });
  });

  it('filtros inválidos → 400 en el campo; sin sesión → 401', async () => {
    const badType = await history('movementType=SALIDA');
    expect(badType.status).toBe(400);
    expect(badType.body.error.details).toEqual([expect.objectContaining({ path: 'movementType' })]);
    expect((await history('from=27/11/2026')).status).toBe(400);
    const inverted = await history('from=2026-11-20&to=2026-11-10');
    expect(inverted.body.error.details).toEqual([expect.objectContaining({ path: 'from' })]);
    expect((await api.get(BASE)).status).toBe(401);
  });
});
