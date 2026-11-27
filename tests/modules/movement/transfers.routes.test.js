// Integración del traslado entre almacenes (HU-403) sobre inventory_test con la app real. Crea sus
// propios productos (COMB-993x 'test.*') y un almacén inactivo (ZW03); el stock inicial nace de
// entradas, para que v_kardex cuadre con stock. Reglas de business_rules.md §2.4: origen y destino
// distintos y activos, existencia del origen validada como en el retiro, atómico (sin "en tránsito"),
// número TRF- sin huecos, sin activo en las líneas, idempotencia y concurrencia.
import { randomUUID } from 'node:crypto';
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

const BASE = '/api/movements';
const one = async (sql, replacements) => (await sequelize.query(sql, { replacements, type: QueryTypes.SELECT }))[0];
const tokenOf = async (user) =>
  (await api.post('/api/auth/login', { body: { username: user.username, password: user.password } })).body.data.accessToken;
const stockOf = async (productId, warehouseId) =>
  (await one('SELECT quantity::text AS q FROM stock WHERE product_id = :productId AND warehouse_id = :warehouseId', { productId, warehouseId }))?.q ?? null;
const trfNumber = async () => (await one("SELECT last_number AS n FROM document_sequences WHERE movement_type = 'TRANSFER'")).n;

const move = (body, { token = tokens.almacenista, key } = {}) =>
  api.post(`${BASE}/transfers`, { token, body, headers: key ? { 'Idempotency-Key': key } : undefined });
const transfer = (lines, overrides = {}) => ({ warehouseFromId: ids.comb, warehouseToId: ids.prin, lines, ...overrides });
const enter = async (warehouseId, productId, quantity) => {
  const res = await api.post(`${BASE}/entries`, { token: tokens.almacenista, body: { warehouseId, reason: 'COMPRA', lines: [{ productId, quantity }] } });
  expect(res.status).toBe(201);
};

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
  await sequelize.query("DELETE FROM assets WHERE code = 'ZT-01' AND name LIKE 'test.%'");
  await sequelize.query("DELETE FROM warehouses WHERE code = 'ZW03'");
};

beforeAll(async () => {
  assertTestDatabase();
  await cleanup();
  await deleteTestUsers();
  api = await startServer(app);
  users.admin = await createTestUser({ name: 'tr.admin', roleCode: 'ADMIN' });
  users.almacenista = await createTestUser({ name: 'tr.alm', roleCode: 'ALMACENISTA' });
  users.usuario = await createTestUser({ name: 'tr.usr', roleCode: 'USUARIO' });
  for (const [key, user] of Object.entries(users)) tokens[key] = await tokenOf(user);

  ids.prin = (await one("SELECT id FROM warehouses WHERE code = 'PRIN'")).id;
  ids.comb = (await one("SELECT id FROM warehouses WHERE code = 'COMB'")).id;
  ids.tall = (await one("SELECT id FROM warehouses WHERE code = 'TALL'")).id;
  ids.inactiveWarehouse = (await one("INSERT INTO warehouses (code, name, is_active) VALUES ('ZW03', 'test.Almacén clausurado', false) RETURNING id")).id;
  const product = async (code, name, { isActive = true } = {}) =>
    (
      await one(
        `INSERT INTO products (code, name, product_category_id, unit_id, min_stock, is_active)
         VALUES (:code, :name, (SELECT id FROM product_categories WHERE code = 'COMB'), (SELECT id FROM units WHERE code = 'L'), 0, :isActive) RETURNING id`,
        { code, name, isActive }
      )
    ).id;
  ids.diesel = await product('COMB-9931', 'test.Diésel de traslado');
  ids.oil = await product('COMB-9932', 'test.Aceite de traslado');
  ids.cross = await product('COMB-9933', 'test.Gasolina cruzada');
  ids.inactiveProduct = await product('COMB-9934', 'test.Producto retirado', { isActive: false });
  ids.asset = (
    await one("INSERT INTO assets (code, name, asset_category_id) VALUES ('ZT-01', 'test.Tractor de traslado', (SELECT id FROM asset_categories WHERE code = 'TRACTOR')) RETURNING id")
  ).id;

  await enter(ids.comb, ids.diesel, 300);
  await enter(ids.comb, ids.oil, 100);
});

afterAll(async () => {
  await api?.close();
  await cleanup();
  await deleteTestUsers();
  await sequelize.close();
});

describe('Traslado entre almacenes (business_rules.md §2.4)', () => {
  it('resta en el origen, suma en el destino (crea la fila si no había) y numera TRF- sin huecos', async () => {
    const before = await trfNumber();
    expect(await stockOf(ids.diesel, ids.prin)).toBeNull();
    const res = await move(
      transfer(
        [
          { productId: ids.diesel, quantity: '120.5' },
          { productId: ids.oil, quantity: 30, note: 'test.Tambor para el taller' },
        ],
        { receivedBy: 'test.Chofer del camión', note: 'test.Reposición semanal' }
      )
    );
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      documentNumber: `TRF-${String(before + 1).padStart(6, '0')}`,
      movementType: 'TRANSFER',
      reason: 'TRASLADO',
      reference: null,
      fromWarehouse: { code: 'COMB' },
      toWarehouse: { code: 'PRIN' },
      receivedBy: 'test.Chofer del camión',
      note: 'test.Reposición semanal',
    });
    expect(res.body.data.lines.map((l) => [l.product.code, l.quantity, l.asset, l.note])).toEqual([
      ['COMB-9931', '120.500', null, null],
      ['COMB-9932', '30.000', null, 'test.Tambor para el taller'],
    ]);
    expect(await stockOf(ids.diesel, ids.comb)).toBe('179.500');
    expect(await stockOf(ids.diesel, ids.prin)).toBe('120.500');
    expect(await stockOf(ids.oil, ids.comb)).toBe('70.000');
    expect(await stockOf(ids.oil, ids.prin)).toBe('30.000');

    const back = await move(transfer([{ productId: ids.diesel, quantity: '20.5' }], { warehouseFromId: ids.prin, warehouseToId: ids.comb }));
    expect(back.body.data.documentNumber).toBe(`TRF-${String(before + 2).padStart(6, '0')}`);
    expect(await stockOf(ids.diesel, ids.comb)).toBe('200.000');
    expect(await stockOf(ids.diesel, ids.prin)).toBe('100.000');
  });

  it('la suma de las líneas supera la existencia del origen → INSUFFICIENT_STOCK y no se mueve nada en ningún almacén', async () => {
    const before = await trfNumber();
    const res = await move(transfer([{ productId: ids.diesel, quantity: 150 }, { productId: ids.diesel, quantity: 60 }, { productId: ids.oil, quantity: 1 }]));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(res.body.error.details).toEqual([expect.objectContaining({ productCode: 'COMB-9931', warehouseCode: 'COMB', available: '200.000', requested: '210.000' })]);
    expect(await stockOf(ids.diesel, ids.comb)).toBe('200.000');
    expect(await stockOf(ids.diesel, ids.prin)).toBe('100.000');
    expect(await stockOf(ids.oil, ids.prin)).toBe('30.000');
    expect(await trfNumber()).toBe(before);
  });

  it('destino con id menor que el origen: si falta stock se revierte también lo sumado en el destino', async () => {
    const [low, high] = [ids.prin, ids.tall].sort((a, b) => a - b);
    await enter(high, ids.oil, 5);
    const lowBefore = await stockOf(ids.oil, low);
    const res = await move(transfer([{ productId: ids.oil, quantity: 6 }], { warehouseFromId: high, warehouseToId: low }));
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(await stockOf(ids.oil, low)).toBe(lowBefore);
    expect(await stockOf(ids.oil, high)).toBe('5.000');
    expect((await move(transfer([{ productId: ids.oil, quantity: 5 }], { warehouseFromId: high, warehouseToId: low }))).status).toBe(201);
    expect(await stockOf(ids.oil, high)).toBe('0.000');
  });

  it('la misma Idempotency-Key devuelve el traslado original sin mover dos veces', async () => {
    const key = randomUUID();
    const body = transfer([{ productId: ids.oil, quantity: 10 }]);
    const [a, b] = await Promise.all([move(body, { key }), move(body, { key })]);
    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(a.body.data.id).toBe(b.body.data.id);
    expect(await stockOf(ids.oil, ids.comb)).toBe('60.000');
  });

  it('20 traslados simultáneos de 10 L sobre 100 L: se registran exactamente 10 y el origen queda en 0', async () => {
    await enter(ids.tall, ids.cross, 100);
    const results = await Promise.all(Array.from({ length: 20 }, () => move(transfer([{ productId: ids.cross, quantity: 10 }], { warehouseFromId: ids.tall, warehouseToId: ids.comb }))));
    expect(results.filter((r) => r.status === 201)).toHaveLength(10);
    expect(results.filter((r) => r.status === 409 && r.body.error.code === 'INSUFFICIENT_STOCK')).toHaveLength(10);
    expect(await stockOf(ids.cross, ids.tall)).toBe('0.000');
    expect(await stockOf(ids.cross, ids.comb)).toBe('100.000');
  });

  it('traslados cruzados simultáneos (A→B y B→A con los mismos productos) no se bloquean entre sí', async () => {
    await enter(ids.prin, ids.cross, 100);
    // COMB tiene 100 de gasolina y PRIN otros 100: 10 en cada sentido, a la vez.
    const requests = Array.from({ length: 10 }, (_, i) =>
      i % 2
        ? move(transfer([{ productId: ids.cross, quantity: 5 }, { productId: ids.diesel, quantity: 1 }], { warehouseFromId: ids.comb, warehouseToId: ids.prin }))
        : move(transfer([{ productId: ids.cross, quantity: 5 }, { productId: ids.diesel, quantity: 1 }], { warehouseFromId: ids.prin, warehouseToId: ids.comb }))
    );
    const results = await Promise.all(requests);
    expect(results.map((r) => r.status)).toEqual(Array(10).fill(201));
    expect(await stockOf(ids.cross, ids.comb)).toBe('100.000');
    expect(await stockOf(ids.cross, ids.prin)).toBe('100.000');
  });
});

describe('Validaciones del traslado', () => {
  it('origen igual al destino → INVALID_MOVEMENT_WAREHOUSES en warehouseToId; sin líneas → EMPTY_MOVEMENT', async () => {
    const same = await move(transfer([{ productId: ids.oil, quantity: 1 }], { warehouseToId: ids.comb }));
    expect(same.status).toBe(400);
    expect(same.body.error.code).toBe('INVALID_MOVEMENT_WAREHOUSES');
    expect(same.body.error.details).toEqual([expect.objectContaining({ path: 'warehouseToId' })]);
    expect((await move(transfer([]))).body.error.code).toBe('EMPTY_MOVEMENT');
  });

  it('falta un almacén o se envía un motivo → 400 de validación', async () => {
    const missing = await move({ warehouseFromId: ids.comb, lines: [{ productId: ids.oil, quantity: 1 }] });
    expect(missing.status).toBe(400);
    expect(missing.body.error.details).toEqual([expect.objectContaining({ path: 'warehouseToId' })]);
    expect((await move(transfer([{ productId: ids.oil, quantity: 1 }], { reason: 'CONSUMO' }))).status).toBe(400);
  });

  it('una línea con activo → ASSET_NOT_ALLOWED señalando la línea', async () => {
    const res = await move(transfer([{ productId: ids.oil, quantity: 1 }, { productId: ids.diesel, quantity: 1, assetId: ids.asset }]));
    expect(res.body.error.code).toBe('ASSET_NOT_ALLOWED');
    expect(res.body.error.details).toEqual([expect.objectContaining({ path: 'lines.1.assetId', line: 2 })]);
  });

  it('almacén de origen o destino inactivo, o producto inactivo → INACTIVE_RESOURCE y no se mueve nada', async () => {
    const before = await stockOf(ids.oil, ids.comb);
    expect((await move(transfer([{ productId: ids.oil, quantity: 1 }], { warehouseToId: ids.inactiveWarehouse }))).body.error.code).toBe('INACTIVE_RESOURCE');
    expect((await move(transfer([{ productId: ids.oil, quantity: 1 }], { warehouseFromId: ids.inactiveWarehouse }))).body.error.code).toBe('INACTIVE_RESOURCE');
    expect((await move(transfer([{ productId: ids.oil, quantity: 1 }, { productId: ids.inactiveProduct, quantity: 1 }]))).body.error.code).toBe('INACTIVE_RESOURCE');
    expect(await stockOf(ids.oil, ids.comb)).toBe(before);
  });

  it('ALMACENISTA con 5 días de atraso → MOVEMENT_DATE_INVALID; ADMIN sí puede, con observación; USUARIO → 403; sin sesión → 401', async () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const line = [{ productId: ids.oil, quantity: 1 }];
    expect((await move(transfer(line, { movementDate: fiveDaysAgo }))).body.error.code).toBe('MOVEMENT_DATE_INVALID');
    expect((await move(transfer(line, { movementDate: fiveDaysAgo, note: 'test.Traslado cargado tarde' }), { token: tokens.admin })).status).toBe(201);
    const forbidden = await move(transfer(line), { token: tokens.usuario });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe('FORBIDDEN_ROLE');
    expect((await api.post(`${BASE}/transfers`, { body: {} })).status).toBe(401);
  });

  it('v_kardex registra dos filas por traslado y cuadra con stock en cada almacén', async () => {
    const rows = await sequelize.query(
      `SELECT k.product_id, k.warehouse_id, sum(k.delta)::text AS kardex, s.quantity::text AS stock
       FROM v_kardex k JOIN stock s ON s.product_id = k.product_id AND s.warehouse_id = k.warehouse_id
       WHERE k.product_id IN (:productIds)
       GROUP BY k.product_id, k.warehouse_id, s.quantity`,
      { replacements: { productIds: [ids.diesel, ids.oil, ids.cross] }, type: QueryTypes.SELECT }
    );
    expect(rows.length).toBeGreaterThanOrEqual(6);
    for (const row of rows) expect(row.kardex).toBe(row.stock);
  });
});
