// Integración de la entrada por compra (HU-402) sobre inventory_test con la app real. Crea sus propios
// productos (COMB-991x 'test.*') y un almacén inactivo (ZW02). Reglas de business_rules.md §2.2:
// almacén de destino activo, suma existencias (crea la fila si no había), número ENT- sin huecos,
// sin activo en las líneas, aviso de sobre máximo, idempotencia y conciliación con v_kardex.
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
const stockOf = async (productId, warehouseId = ids.prin) =>
  (await one('SELECT quantity::text AS q FROM stock WHERE product_id = :productId AND warehouse_id = :warehouseId', { productId, warehouseId }))?.q ?? null;
const entNumber = async () => (await one("SELECT last_number AS n FROM document_sequences WHERE movement_type = 'IN'")).n;

const enter = (body, { token = tokens.almacenista, key } = {}) =>
  api.post(`${BASE}/entries`, { token, body, headers: key ? { 'Idempotency-Key': key } : undefined });
const entry = (lines, overrides = {}) => ({ warehouseId: ids.prin, reason: 'COMPRA', lines, ...overrides });

/** Los movimientos son inmutables: el trigger se apaga solo durante el borrado y solo en *_test. */
const cleanup = async () => {
  assertTestDatabase();
  await sequelize.transaction(async (transaction) => {
    const q = (sql) => sequelize.query(sql, { transaction });
    const testHeaders = `SELECT h.id FROM movement_headers h JOIN users u ON u.id = h.created_by_user_id WHERE u.username LIKE 'test.%'`;
    await q('ALTER TABLE movement_lines DISABLE TRIGGER trg_movements_immutable');
    await q('ALTER TABLE movement_headers DISABLE TRIGGER trg_movements_immutable');
    await q(`DELETE FROM movement_lines WHERE movement_header_id IN (${testHeaders})`);
    await q(`DELETE FROM movement_headers WHERE id IN (${testHeaders})`);
    await q('ALTER TABLE movement_lines ENABLE TRIGGER trg_movements_immutable');
    await q('ALTER TABLE movement_headers ENABLE TRIGGER trg_movements_immutable');
  });
  await sequelize.query("DELETE FROM stock WHERE product_id IN (SELECT id FROM products WHERE name LIKE 'test.%')");
  await sequelize.query("DELETE FROM products WHERE name LIKE 'test.%'");
  await sequelize.query("DELETE FROM assets WHERE code = 'ZN-01' AND name LIKE 'test.%'");
  await sequelize.query("DELETE FROM warehouses WHERE code = 'ZW02'");
};

beforeAll(async () => {
  assertTestDatabase();
  await cleanup();
  await deleteTestUsers();
  api = await startServer(app);
  users.admin = await createTestUser({ name: 'en.admin', roleCode: 'ADMIN' });
  users.almacenista = await createTestUser({ name: 'en.alm', roleCode: 'ALMACENISTA' });
  users.usuario = await createTestUser({ name: 'en.usr', roleCode: 'USUARIO' });
  for (const [key, user] of Object.entries(users)) tokens[key] = await tokenOf(user);

  ids.prin = (await one("SELECT id FROM warehouses WHERE code = 'PRIN'")).id;
  ids.comb = (await one("SELECT id FROM warehouses WHERE code = 'COMB'")).id;
  ids.inactiveWarehouse = (await one("INSERT INTO warehouses (code, name, is_active) VALUES ('ZW02', 'test.Almacén cerrado', false) RETURNING id")).id;
  const product = async (code, name, { minStock = 0, maxStock = null, isActive = true } = {}) =>
    (
      await one(
        `INSERT INTO products (code, name, product_category_id, unit_id, min_stock, max_stock, is_active)
         VALUES (:code, :name, (SELECT id FROM product_categories WHERE code = 'COMB'), (SELECT id FROM units WHERE code = 'L'), :minStock, :maxStock, :isActive) RETURNING id`,
        { code, name, minStock, maxStock, isActive }
      )
    ).id;
  ids.diesel = await product('COMB-9911', 'test.Diésel de compra', { maxStock: 500 });
  ids.oil = await product('COMB-9912', 'test.Aceite de compra');
  ids.inactiveProduct = await product('COMB-9913', 'test.Producto descontinuado', { isActive: false });
  ids.asset = (
    await one("INSERT INTO assets (code, name, asset_category_id) VALUES ('ZN-01', 'test.Tractor de entrada', (SELECT id FROM asset_categories WHERE code = 'TRACTOR')) RETURNING id")
  ).id;
});

afterAll(async () => {
  await api?.close();
  await cleanup();
  await deleteTestUsers();
  await sequelize.close();
});

describe('Entrada por compra (business_rules.md §2.2)', () => {
  it('suma existencias, crea la fila si el producto nunca estuvo en el almacén y numera ENT- sin huecos', async () => {
    const before = await entNumber();
    expect(await stockOf(ids.diesel)).toBeNull();
    const res = await enter(
      entry(
        [
          { productId: ids.diesel, quantity: '200.5' },
          { productId: ids.oil, quantity: 40, note: 'test.Tambor de 200 L' },
        ],
        { reference: ' fac-0012345 ', receivedBy: 'test.Chofer del proveedor' }
      )
    );
    expect(res.status).toBe(201);
    const movement = res.body.data;
    expect(movement).toMatchObject({
      documentNumber: `ENT-${String(before + 1).padStart(6, '0')}`,
      movementType: 'IN',
      reason: 'COMPRA',
      reference: 'FAC-0012345',
      workOrder: null,
      fromWarehouse: null,
      toWarehouse: { code: 'PRIN' },
      receivedBy: 'test.Chofer del proveedor',
    });
    expect(movement.lines.map((l) => [l.product.code, l.quantity, l.asset, l.note])).toEqual([
      ['COMB-9911', '200.500', null, null],
      ['COMB-9912', '40.000', null, 'test.Tambor de 200 L'],
    ]);
    expect(await stockOf(ids.diesel)).toBe('200.500');

    const again = await enter(entry([{ productId: ids.diesel, quantity: 100 }]));
    expect(again.body.data.documentNumber).toBe(`ENT-${String(before + 2).padStart(6, '0')}`);
    expect(await stockOf(ids.diesel)).toBe('300.500');
  });

  it('el mismo producto en dos líneas se suma en una y se avisa; si supera el máximo, aviso sin bloquear', async () => {
    const res = await enter(entry([{ productId: ids.diesel, quantity: 150 }, { productId: ids.diesel, quantity: 100 }]));
    expect(res.status).toBe(201);
    expect(res.body.data.lines).toEqual([expect.objectContaining({ quantity: '250.000' })]);
    expect(res.body.meta.warnings.consolidated).toEqual([{ productId: ids.diesel, assetId: null, lines: [1, 2] }]);
    // 300,5 + 250 = 550,5, por encima del máximo de 500.
    expect(res.body.meta.warnings.aboveMaximum).toEqual([expect.objectContaining({ productCode: 'COMB-9911', total: '550.500', maxStock: '500.000' })]);
    expect(await stockOf(ids.diesel)).toBe('550.500');
  });

  it('la misma Idempotency-Key devuelve la entrada original sin sumar dos veces', async () => {
    const key = randomUUID();
    const body = entry([{ productId: ids.oil, quantity: 10 }]);
    const [a, b] = await Promise.all([enter(body, { key }), enter(body, { key })]);
    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(a.body.data.id).toBe(b.body.data.id);
    expect(await stockOf(ids.oil)).toBe('50.000');
  });

  it('10 entradas simultáneas de 5 L: suman exactamente 50 L con números consecutivos', async () => {
    const before = await stockOf(ids.oil, ids.comb);
    expect(before).toBeNull();
    const results = await Promise.all(Array.from({ length: 10 }, () => enter(entry([{ productId: ids.oil, quantity: 5 }], { warehouseId: ids.comb }))));
    expect(results.every((r) => r.status === 201)).toBe(true);
    expect(await stockOf(ids.oil, ids.comb)).toBe('50.000');
    const numbers = results.map((r) => Number(r.body.data.documentNumber.slice(4))).sort((x, y) => x - y);
    expect(new Set(numbers).size).toBe(10);
    expect(numbers[9] - numbers[0]).toBe(9);
  });
});

describe('Validaciones de la entrada', () => {
  it('motivo DEVOLUCION (llega con los préstamos) o de salida → INVALID_MOVEMENT_REASON; sin líneas → EMPTY_MOVEMENT', async () => {
    const line = [{ productId: ids.oil, quantity: 1 }];
    const devolution = await enter(entry(line, { reason: 'DEVOLUCION' }));
    expect(devolution.body.error.code).toBe('INVALID_MOVEMENT_REASON');
    expect((await enter(entry(line, { reason: 'CONSUMO' }))).body.error.code).toBe('INVALID_MOVEMENT_REASON');
    expect((await enter(entry([]))).body.error.code).toBe('EMPTY_MOVEMENT');
  });

  it('OTRO sin observación → 400 en note; con observación se registra', async () => {
    const line = [{ productId: ids.oil, quantity: 1 }];
    const noNote = await enter(entry(line, { reason: 'OTRO' }));
    expect(noNote.status).toBe(400);
    expect(noNote.body.error.details).toEqual([expect.objectContaining({ path: 'note' })]);
    expect((await enter(entry(line, { reason: 'OTRO', note: 'test.Donación del proveedor' }))).status).toBe(201);
  });

  it('referencia: formato PREFIJO-número; REV- (corrección) no se admite aquí', async () => {
    const line = [{ productId: ids.oil, quantity: 1 }];
    const badFormat = await enter(entry(line, { reference: 'factura 123' }));
    expect(badFormat.status).toBe(400);
    expect(badFormat.body.error.details).toEqual([expect.objectContaining({ path: 'reference' })]);
    const correction = await enter(entry(line, { reference: 'REV-RET-000145' }));
    expect(correction.status).toBe(400);
    expect(correction.body.error.details).toEqual([expect.objectContaining({ path: 'reference' })]);
    expect((await enter(entry(line, { reference: 'OC-2026-0087' }))).body.data.reference).toBe('OC-2026-0087');
    expect((await enter(entry(line))).body.data.reference).toBeNull();
  });

  it('una línea con activo → ASSET_NOT_ALLOWED señalando la línea', async () => {
    const res = await enter(entry([{ productId: ids.oil, quantity: 1 }, { productId: ids.diesel, quantity: 1, assetId: ids.asset }]));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('ASSET_NOT_ALLOWED');
    expect(res.body.error.details).toEqual([expect.objectContaining({ path: 'lines.1.assetId', line: 2 })]);
  });

  it('almacén o producto inactivo → INACTIVE_RESOURCE y no se suma nada', async () => {
    const before = await stockOf(ids.oil);
    const closed = await enter(entry([{ productId: ids.oil, quantity: 1 }], { warehouseId: ids.inactiveWarehouse }));
    expect(closed.body.error.code).toBe('INACTIVE_RESOURCE');
    const discontinued = await enter(entry([{ productId: ids.oil, quantity: 1 }, { productId: ids.inactiveProduct, quantity: 1 }]));
    expect(discontinued.body.error.code).toBe('INACTIVE_RESOURCE');
    expect(await stockOf(ids.oil)).toBe(before);
  });

  it('ALMACENISTA con 5 días de atraso → MOVEMENT_DATE_INVALID; USUARIO → 403; sin sesión → 401', async () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    expect((await enter(entry([{ productId: ids.oil, quantity: 1 }], { movementDate: fiveDaysAgo }))).body.error.code).toBe('MOVEMENT_DATE_INVALID');
    const forbidden = await enter(entry([{ productId: ids.oil, quantity: 1 }]), { token: tokens.usuario });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe('FORBIDDEN_ROLE');
    expect((await api.post(`${BASE}/entries`, { body: {} })).status).toBe(401);
  });

  it('una entrada habilita el retiro: lo que entró se puede retirar y v_kardex cuadra con stock', async () => {
    const withdrawal = await api.post(`${BASE}/withdrawals`, {
      token: tokens.almacenista,
      body: { warehouseId: ids.prin, reason: 'CONSUMO', lines: [{ productId: ids.diesel, quantity: 50, assetId: ids.asset }] },
    });
    expect(withdrawal.status).toBe(201);
    expect(await stockOf(ids.diesel)).toBe('500.500');
    const rows = await sequelize.query(
      `SELECT sum(k.delta)::text AS kardex, s.quantity::text AS stock
       FROM v_kardex k JOIN stock s ON s.product_id = k.product_id AND s.warehouse_id = k.warehouse_id
       WHERE k.product_id IN (:productIds)
       GROUP BY k.product_id, k.warehouse_id, s.quantity`,
      { replacements: { productIds: [ids.diesel, ids.oil] }, type: QueryTypes.SELECT }
    );
    expect(rows.length).toBe(3);
    for (const row of rows) expect(row.kardex).toBe(row.stock);
  });
});
