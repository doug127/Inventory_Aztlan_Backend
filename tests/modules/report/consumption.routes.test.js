// Integración del reporte de consumo (HU-501) sobre inventory_test con la app real. Registra por la API
// consumos de diésel y aceite (COMB-997x / LUBR-997x 'test.*') en un tractor, una retroexcavadora y un
// cargador (ZW-0x), una corrección de un consumo, un desecho corregido y un préstamo. scrum_plan.md §6,
// módulo 7: LINEA_AMARILLA solo suma retroexcavadoras y cargadores; la corrección REV- da el consumo neto.
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
const correct = (movement, quantity) =>
  post(`${movement.id}/corrections`, { note: 'test.Se retiró de más', lines: [{ lineId: movement.lines[0].id, quantity }] });
const report = (query, token = tokens.usuario) => api.get(`/api/reports/consumption?${query}`, { token });
const daysAgo = (n) => {
  const d = new Date(Date.now() - n * 24 * 60 * 60 * 1000);
  d.setHours(12, 0, 0, 0);
  return d;
};
const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** [grupo, producto, consumido, corregido, neto] de cada fila. */
const rows = (res) =>
  res.body.data.map((r) => [(r.asset ?? r.assetCategory).code, r.product.code, r.consumed, r.corrected, r.net]);

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
  await sequelize.query("DELETE FROM assets WHERE code LIKE 'ZW-%' AND name LIKE 'test.%'");
};

beforeAll(async () => {
  assertTestDatabase();
  await cleanup();
  await deleteTestUsers();
  api = await startServer(app);
  tokens.admin = await tokenOf(await createTestUser({ name: 'rp.admin', roleCode: 'ADMIN' }));
  tokens.usuario = await tokenOf(await createTestUser({ name: 'rp.usr', roleCode: 'USUARIO' }));

  ids.comb = await idOf('warehouses', 'COMB');
  for (const code of ['VEHICULOS', 'MAQUINARIA_AGRICOLA', 'LINEA_AMARILLA', 'RETROEXCAVADORA', 'TRACTOR', 'CARGADOR_FRONTAL']) ids[code] = await idOf('asset_categories', code);
  ids.LUBR = await idOf('product_categories', 'LUBR');
  const product = async (code, name, category) =>
    (
      await one(
        `INSERT INTO products (code, name, product_category_id, unit_id, min_stock)
         VALUES (:code, :name, (SELECT id FROM product_categories WHERE code = :category), (SELECT id FROM units WHERE code = 'L'), 0) RETURNING id`,
        { code, name, category }
      )
    ).id;
  ids.diesel = await product('COMB-9971', 'test.Diésel del reporte', 'COMB');
  ids.oil = await product('LUBR-9971', 'test.Aceite del reporte', 'LUBR');
  const asset = async (code, name, category) =>
    (await one('INSERT INTO assets (code, name, asset_category_id) VALUES (:code, :name, (SELECT id FROM asset_categories WHERE code = :category)) RETURNING id', { code, name, category }))
      .id;
  ids.tractor = await asset('ZW-01', 'test.Tractor del reporte', 'TRACTOR');
  ids.retro = await asset('ZW-02', 'test.Retroexcavadora del reporte', 'RETROEXCAVADORA');
  ids.loader = await asset('ZW-03', 'test.Cargador del reporte', 'CARGADOR_FRONTAL');

  await post('entries', {
    warehouseId: ids.comb,
    reason: 'COMPRA',
    movementDate: daysAgo(12).toISOString(),
    note: 'test.Compra cargada tarde',
    lines: [{ productId: ids.diesel, quantity: 2000 }, { productId: ids.oil, quantity: 100 }],
  });
  // El tractor consumió hace 10 días; hoy se corrigen 30 L de ese consumo (cae en el período de hoy).
  docs.tractor = await post('withdrawals', {
    warehouseId: ids.comb,
    reason: 'CONSUMO',
    movementDate: daysAgo(10).toISOString(),
    note: 'test.Consumo cargado tarde',
    lines: [{ productId: ids.diesel, quantity: 300, assetId: ids.tractor }],
  });
  await correct(docs.tractor, 30);
  docs.retro = await post('withdrawals', { warehouseId: ids.comb, reason: 'CONSUMO', lines: [{ productId: ids.diesel, quantity: 200, assetId: ids.retro }] });
  await correct(docs.retro, 50);
  await post('withdrawals', {
    warehouseId: ids.comb,
    reason: 'CONSUMO',
    lines: [{ productId: ids.diesel, quantity: 100, assetId: ids.loader }, { productId: ids.oil, quantity: 10, assetId: ids.loader }],
  });
  // No son consumo: un desecho con activo (y su corrección, una IN OTRO REV- con activo) y un préstamo.
  docs.waste = await post('withdrawals', {
    warehouseId: ids.comb,
    reason: 'DESECHO',
    note: 'test.Diésel contaminado',
    lines: [{ productId: ids.diesel, quantity: 40, assetId: ids.retro }],
  });
  await correct(docs.waste, 40);
  await post('withdrawals', { warehouseId: ids.comb, reason: 'PRESTAMO', receivedBy: 'test.Operador', lines: [{ productId: ids.diesel, quantity: 20, assetId: ids.tractor }] });
});

afterAll(async () => {
  await api?.close();
  await cleanup();
  await deleteTestUsers();
  await sequelize.close();
});

describe('Reporte de consumo (GET /api/reports/consumption)', () => {
  it('LINEA_AMARILLA solo suma retroexcavadoras y cargadores, con el consumo neto (sin el desecho ni su corrección)', async () => {
    const res = await report(`assetCategoryId=${ids.LINEA_AMARILLA}&productId=${ids.diesel}`);
    expect(res.status).toBe(200);
    expect(rows(res)).toEqual([
      ['ZW-02', 'COMB-9971', '200.000', '50.000', '150.000'],
      ['ZW-03', 'COMB-9971', '100.000', '0.000', '100.000'],
    ]);
    expect(res.body.data[0]).toMatchObject({ asset: { name: 'test.Retroexcavadora del reporte', category: { code: 'RETROEXCAVADORA' } }, assetCategory: null, lines: 2 });
    expect(res.body.meta.summary).toMatchObject({
      groups: 2,
      lines: 3,
      assetCategory: { code: 'LINEA_AMARILLA' },
      products: [{ product: { code: 'COMB-9971', unitCode: 'L' }, consumed: '300.000', corrected: '50.000', net: '250.000', assets: 2 }],
    });
    expect(res.body.meta.filters).toEqual({ groupBy: 'asset', productId: ids.diesel, assetCategoryId: ids.LINEA_AMARILLA });
  });

  it('por categoría: con VEHICULOS compara sus hijas (Línea amarilla contra Maquinaria agrícola)', async () => {
    const res = await report(`groupBy=assetCategory&assetCategoryId=${ids.VEHICULOS}&productId=${ids.diesel}`);
    expect(res.status).toBe(200);
    expect(rows(res)).toEqual([
      ['LINEA_AMARILLA', 'COMB-9971', '300.000', '50.000', '250.000'],
      ['MAQUINARIA_AGRICOLA', 'COMB-9971', '300.000', '30.000', '270.000'],
    ]);
    expect(res.body.data[0]).toMatchObject({ asset: null, assetCategory: { name: 'Línea amarilla', isLeaf: false }, assets: 2 });
    expect(res.body.meta.summary).toMatchObject({ groups: 2, products: [{ net: '520.000', assets: 3 }] });
  });

  it('por categoría: sin filtro agrupa por raíz; con una hoja, la hoja misma', async () => {
    const roots = await report(`groupBy=assetCategory&productId=${ids.diesel}`);
    expect(rows(roots)).toEqual([['VEHICULOS', 'COMB-9971', '600.000', '80.000', '520.000']]);
    const leaf = await report(`groupBy=assetCategory&assetCategoryId=${ids.RETROEXCAVADORA}&productId=${ids.diesel}`);
    expect(rows(leaf)).toEqual([['RETROEXCAVADORA', 'COMB-9971', '200.000', '50.000', '150.000']]);
    expect(leaf.body.data[0].assetCategory.isLeaf).toBe(true);
  });

  it('por categoría de producto (incluye subcategorías) y por activo', async () => {
    const lubr = await report(`productCategoryId=${ids.LUBR}&assetCategoryId=${ids.VEHICULOS}`);
    expect(rows(lubr).filter(([asset]) => asset.startsWith('ZW-'))).toEqual([['ZW-03', 'LUBR-9971', '10.000', '0.000', '10.000']]);
    const loader = await report(`assetId=${ids.loader}`);
    expect(rows(loader)).toEqual([
      ['ZW-03', 'COMB-9971', '100.000', '0.000', '100.000'],
      ['ZW-03', 'LUBR-9971', '10.000', '0.000', '10.000'],
    ]);
    expect(loader.body.meta.summary.products).toHaveLength(2);
  });

  it('período: la corrección cuenta en la fecha en que se registró, así que el neto puede ser negativo', async () => {
    const recent = await report(`from=${isoDay(daysAgo(5))}&to=${isoDay(new Date())}&assetCategoryId=${ids.VEHICULOS}&productId=${ids.diesel}`);
    expect(rows(recent)).toEqual([
      ['ZW-01', 'COMB-9971', '0.000', '30.000', '-30.000'],
      ['ZW-02', 'COMB-9971', '200.000', '50.000', '150.000'],
      ['ZW-03', 'COMB-9971', '100.000', '0.000', '100.000'],
    ]);
    const old = await report(`to=${isoDay(daysAgo(10))}&productId=${ids.diesel}`);
    expect(rows(old)).toEqual([['ZW-01', 'COMB-9971', '300.000', '0.000', '300.000']]);
    expect(old.body.data[0].lastConsumedAt).toBe(docs.tractor.movementDate);
  });

  it('pagina las filas; el summary es de todo el alcance y no cambia con la página', async () => {
    const page2 = await report(`assetCategoryId=${ids.VEHICULOS}&productId=${ids.diesel}&limit=1&page=2`);
    expect(rows(page2)).toEqual([['ZW-02', 'COMB-9971', '200.000', '50.000', '150.000']]);
    expect(page2.body.meta.pagination).toMatchObject({ page: 2, limit: 1, totalItems: 3, totalPages: 3 });
    expect(page2.body.meta.summary).toMatchObject({ groups: 3, products: [{ net: '520.000' }] });
  });

  it('coincide con la ficha del activo (HU-304), que tampoco resta la corrección del desecho', async () => {
    const sheet = await api.get(`/api/assets/${ids.retro}/consumption`, { token: tokens.usuario });
    expect(sheet.status).toBe(200);
    expect(sheet.body.data.consumption).toEqual([expect.objectContaining({ product: expect.objectContaining({ code: 'COMB-9971' }), consumed: '200.000', corrected: '50.000', net: '150.000' })]);
  });

  it('errores: sin sesión 401, fechas al revés o groupBy desconocido 400, categoría o activo inexistente 404', async () => {
    expect((await api.get('/api/reports/consumption')).status).toBe(401);
    const reversed = await report('from=2026-11-20&to=2026-11-01');
    expect(reversed.status).toBe(400);
    expect(reversed.body.error.code).toBe('VALIDATION_ERROR');
    expect((await report('groupBy=product')).status).toBe(400);
    expect((await report('assetCategoryId=999999')).status).toBe(404);
    expect((await report('assetId=999999')).status).toBe(404);
    expect((await report('productCategoryId=999999')).status).toBe(404);
  });
});
