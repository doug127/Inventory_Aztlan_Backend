// Integración de la exportación a Excel (HU-503) sobre inventory_test con la app real. Con productos de
// una categoría de prueba (TSTX 'test.*') y movimientos registrados por la API, cada exportación se lee
// de vuelta con exceljs y se compara con la respuesta JSON de su pantalla: scrum_plan.md §6, módulo 7,
// "cada reporte exporta a Excel con los mismos totales que muestra en pantalla".
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import ExcelJS from 'exceljs';
import { QueryTypes } from 'sequelize';
import app from '#src/app.js';
import { sequelize } from '#src/config/database.js';
import { startServer } from '../../helpers/http.js';
import { assertTestDatabase, createTestUser, deleteTestUsers } from '../../helpers/db.js';

let api;
const tokens = {};
const ids = {};
const docs = {};
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const one = async (sql, replacements) => (await sequelize.query(sql, { replacements, type: QueryTypes.SELECT }))[0];
const idOf = async (table, code) => (await one(`SELECT id FROM ${table} WHERE code = :code`, { code })).id;
const tokenOf = async (user) =>
  (await api.post('/api/auth/login', { body: { username: user.username, password: user.password } })).body.data.accessToken;
const post = async (path, body) => {
  const res = await api.post(`/api/movements/${path}`, { token: tokens.admin, body });
  expect(res.status, JSON.stringify(res.body.error)).toBe(201);
  return res.body.data;
};
const get = (path, token = tokens.usuario) => api.get(path, { token });

/** Descarga una exportación y devuelve sus hojas como listas de filas (valores de celda). */
const download = async (path) => {
  const res = await get(path);
  expect(res.status, res.body ? JSON.stringify(res.body.error) : '').toBe(200);
  expect(res.headers.get('content-type')).toContain(XLSX);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(res.buffer);
  const sheets = {};
  workbook.eachSheet((ws) => {
    const rows = [];
    ws.eachRow({ includeEmpty: true }, (row) => rows.push(row.values.slice(1)));
    sheets[ws.name] = rows;
  });
  return { res, sheets };
};

/** Filas de datos del bloque cuyo título empieza por `title`: desde su encabezado hasta la fila vacía. */
const block = (rows, title) => {
  const start = rows.findIndex((r) => typeof r[0] === 'string' && r[0].startsWith(title));
  expect(start, `bloque "${title}"`).toBeGreaterThanOrEqual(0);
  let header = start + 1;
  while (rows[header]?.length === 1) header += 1; // una nota (filas truncadas) entre el título y el encabezado
  const data = [];
  for (let i = header + 1; i < rows.length && rows[i].length > 0; i += 1) data.push(rows[i]);
  return { header: rows[header], data };
};
const col = (b, name) => {
  const i = b.header.indexOf(name);
  expect(i, `columna "${name}"`).toBeGreaterThanOrEqual(0);
  return b.data.map((r) => r[i] ?? null);
};
const num = (values) => values.map((v) => (v === null || v === undefined ? null : Number(v)));

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
  await sequelize.query("DELETE FROM assets WHERE code LIKE 'ZX-%' AND name LIKE 'test.%'");
  await sequelize.query("DELETE FROM product_categories WHERE code = 'TSTX' AND name LIKE 'test.%'");
};

beforeAll(async () => {
  assertTestDatabase();
  await cleanup();
  await deleteTestUsers();
  api = await startServer(app);
  tokens.admin = await tokenOf(await createTestUser({ name: 'rx.admin', roleCode: 'ADMIN' }));
  tokens.usuario = await tokenOf(await createTestUser({ name: 'rx.usr', roleCode: 'USUARIO' }));

  ids.comb = await idOf('warehouses', 'COMB');
  ids.prin = await idOf('warehouses', 'PRIN');
  ids.TSTX = (await one("INSERT INTO product_categories (code, name) VALUES ('TSTX', 'test.Exportación') RETURNING id")).id;
  const product = async (code, name) =>
    (
      await one(
        `INSERT INTO products (code, name, product_category_id, unit_id, min_stock)
         VALUES (:code, :name, :categoryId, (SELECT id FROM units WHERE code = 'L'), 100) RETURNING id`,
        { code, name, categoryId: ids.TSTX }
      )
    ).id;
  ids.diesel = await product('TSTX-0001', 'test.Diésel de exportación');
  ids.oil = await product('TSTX-0002', 'test.Aceite de exportación');
  ids.tractor = (await one("INSERT INTO assets (code, name, asset_category_id) VALUES ('ZX-01', 'test.Tractor de exportación', (SELECT id FROM asset_categories WHERE code = 'TRACTOR')) RETURNING id")).id;

  await post('entries', { warehouseId: ids.comb, reason: 'COMPRA', note: 'test.Compra', lines: [{ productId: ids.diesel, quantity: 500 }, { productId: ids.oil, quantity: 50 }] });
  docs.consumption = await post('withdrawals', { warehouseId: ids.comb, reason: 'CONSUMO', lines: [{ productId: ids.diesel, quantity: 120.5, assetId: ids.tractor }] });
  await post(`${docs.consumption.id}/corrections`, { note: 'test.Se retiró de más', lines: [{ lineId: docs.consumption.lines[0].id, quantity: 20 }] });
  await post('transfers', { warehouseFromId: ids.comb, warehouseToId: ids.prin, lines: [{ productId: ids.diesel, quantity: 100 }] });
  await post('withdrawals', { warehouseId: ids.comb, reason: 'DESECHO', note: 'test.Aceite contaminado', lines: [{ productId: ids.oil, quantity: 5 }] });
});

afterAll(async () => {
  await api?.close();
  await cleanup();
  await deleteTestUsers();
  await sequelize.close();
});

describe('Exportación a Excel (GET /api/reports/*/export)', () => {
  it('movimientos por período: el mismo resumen por tipo, motivo y período, y las mismas filas por producto', async () => {
    const query = `productCategoryId=${ids.TSTX}`;
    const json = (await get(`/api/reports/movements?${query}&limit=100`)).body;
    const { res, sheets } = await download(`/api/reports/movements/export?${query}`);
    expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename="movimientos-por-periodo-\d{4}-\d{2}-\d{2}\.xlsx"/);
    expect(Object.keys(sheets)).toEqual(['Resumen', 'Por producto']);

    const byType = block(sheets.Resumen, 'Documentos por tipo');
    expect(byType.data[0]).toEqual([json.meta.summary.byType.IN, json.meta.summary.byType.OUT, json.meta.summary.byType.TRANSFER, json.meta.summary.byType.ADJUST, 5, 6, 2]);
    const byReason = block(sheets.Resumen, 'Por tipo y motivo');
    expect(col(byReason, 'Documentos')).toEqual(json.meta.summary.byReason.map((r) => r.documents));
    expect(col(byReason, 'Correcciones')).toEqual(json.meta.summary.byReason.map((r) => r.corrections));
    expect(col(block(sheets.Resumen, 'Por mes'), 'Documentos')).toEqual(json.meta.summary.byPeriod.map((p) => p.documents));

    const products = block(sheets['Por producto'], 'Por producto');
    expect(col(products, 'Código')).toEqual(['TSTX-0001', 'TSTX-0002']);
    for (const field of [['Entradas', 'entries'], ['Salidas', 'exits'], ['Traslado entra', 'transfersIn'], ['Traslado sale', 'transfersOut'], ['Neto', 'net']]) {
      expect(num(col(products, field[0])), field[0]).toEqual(json.data.map((r) => Number(r[field[1]])));
    }
    // 500 comprados + 20 corregidos − 120,5 consumidos; el traslado entra y sale.
    expect(col(products, 'Neto')[0]).toBe(399.5);
  });

  it('consumo: los mismos totales por producto (consumo neto) y el mismo detalle por activo', async () => {
    const query = `productCategoryId=${ids.TSTX}`;
    const json = (await get(`/api/reports/consumption?${query}&limit=100`)).body;
    const { res, sheets } = await download(`/api/reports/consumption/export?${query}`);
    expect(res.headers.get('content-disposition')).toContain('consumo-por-activo-');
    const totals = block(sheets.Consumo, 'Totales por producto');
    expect(num(col(totals, 'Neto'))).toEqual(json.meta.summary.products.map((p) => Number(p.net)));
    expect(num(col(totals, 'Neto'))).toEqual([100.5]);
    const detail = block(sheets.Consumo, 'Detalle por activo');
    expect(col(detail, 'Activo')).toEqual(json.data.map((r) => r.asset.code));
    expect(num(col(detail, 'Corregido'))).toEqual([20]);

    const byCategory = await download(`/api/reports/consumption/export?${query}&groupBy=assetCategory`);
    expect(byCategory.res.headers.get('content-disposition')).toContain('consumo-por-categoria-');
    expect(num(col(block(byCategory.sheets.Consumo, 'Totales por producto'), 'Neto'))).toEqual([100.5]);
  });

  it('existencias: el mismo resumen por estado y las mismas existencias que la pantalla', async () => {
    const query = `categoryId=${ids.TSTX}`;
    const json = (await get(`/api/stock?${query}&limit=100`)).body;
    const { sheets } = await download(`/api/reports/stock/export?${query}`);
    const s = json.meta.summary;
    expect(block(sheets.Existencias, 'Productos por estado').data[0]).toEqual([s.normal, s.bajoMinimo, s.sobreMaximo, s.total]);
    const detail = block(sheets.Existencias, 'Detalle');
    expect(col(detail, 'Código')).toEqual(json.data.map((r) => r.product.code));
    expect(num(col(detail, 'Existencia total'))).toEqual(json.data.map((r) => Number(r.quantity)));
    expect(col(detail, 'Estado')).toEqual(['Normal', 'Bajo el mínimo']); // aceite: 45 L, mínimo 100

    const byWarehouse = await download(`/api/reports/stock/export?${query}&groupBy=warehouse`);
    const rows = block(byWarehouse.sheets.Existencias, 'Detalle');
    expect(col(rows, 'Almacén').filter((w) => w.startsWith('PRIN'))).toHaveLength(1);
  });

  it('kardex: el mismo resumen del período y el saldo acumulado; la fecha en la hora del servidor', async () => {
    const query = `productId=${ids.diesel}&warehouseId=${ids.comb}`;
    const json = (await get(`/api/stock/kardex?${query}&limit=100`)).body;
    const { res, sheets } = await download(`/api/reports/kardex/export?${query}`);
    expect(res.headers.get('content-disposition')).toContain('kardex-TSTX-0001-');
    const s = json.meta.summary;
    expect(block(sheets.Kardex, 'Resumen del período').data[0]).toEqual([Number(s.opening), Number(s.in), Number(s.out), Number(s.closing)]);
    const moves = block(sheets.Kardex, 'Movimientos');
    expect(col(moves, 'Documento')).toEqual(json.data.map((r) => r.movement.documentNumber));
    expect(num(col(moves, 'Saldo'))).toEqual(json.data.map((r) => Number(r.balance)));
    // Excel guarda la hora sin zona: la celda debe mostrar la hora local del movimiento.
    const first = new Date(json.data[0].movement.movementDate);
    const cell = col(moves, 'Fecha')[0];
    expect([cell.getUTCHours(), cell.getUTCMinutes(), cell.getUTCDate()]).toEqual([first.getHours(), first.getMinutes(), first.getDate()]);
  });

  it('historial: los mismos documentos y filtros que el historial', async () => {
    const query = `productId=${ids.oil}`;
    const json = (await get(`/api/movements?${query}&limit=100`)).body;
    const { sheets } = await download(`/api/reports/history/export?${query}`);
    const rows = block(sheets.Movimientos, `${json.meta.pagination.totalItems} documentos`);
    expect(col(rows, 'Documento')).toEqual(json.data.map((m) => m.documentNumber));
    expect(col(rows, 'Tipo')).toEqual(['Orden de retiro', 'Entrada']);
    expect(col(rows, 'Motivo')).toEqual(['Desecho', 'Compra']);
    expect(sheets.Movimientos.some((r) => r[0] === 'Producto' && r[1] === 'TSTX-0002 · test.Aceite de exportación')).toBe(true);
  });

  it('errores: sin sesión 401, filtros inválidos 400, recurso inexistente 404 (con el sobre JSON de error)', async () => {
    expect((await api.get('/api/reports/movements/export')).status).toBe(401);
    const noProduct = await get('/api/reports/kardex/export');
    expect(noProduct.status).toBe(400);
    expect(noProduct.body.error.code).toBe('VALIDATION_ERROR');
    expect((await get('/api/reports/movements/export?movementType=IN&reason=CONSUMO')).status).toBe(400);
    expect((await get('/api/reports/stock/export?warehouseId=999999')).status).toBe(404);
    expect((await get('/api/reports/consumption/export?assetId=999999')).status).toBe(404);
  });
});
