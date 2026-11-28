// Integración del ajuste por conteo físico (HU-404) sobre inventory_test con la app real. Crea sus
// propios productos (COMB-994x 'test.*') y un almacén inactivo (ZW04); el stock inicial nace de
// entradas, para que v_kardex cuadre con stock. Reglas de business_rules.md §2.5: solo ADMIN y
// SUPERADMIN, un solo almacén (sobrante suma en destino, faltante resta en origen sin dejar negativo),
// acta CF- y observación obligatorias, número AJU- sin huecos, idempotencia y concurrencia.
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
const ajuNumber = async () => (await one("SELECT last_number AS n FROM document_sequences WHERE movement_type = 'ADJUST'")).n;

const adjust = (body, { token = tokens.admin, key } = {}) =>
  api.post(`${BASE}/adjustments`, { token, body, headers: key ? { 'Idempotency-Key': key } : undefined });
const adjustment = (lines, overrides = {}) => ({
  warehouseId: ids.prin,
  kind: 'FALTANTE',
  reference: 'CF-2026-004',
  note: 'test.Conteo físico de noviembre',
  lines,
  ...overrides,
});
const enter = async (warehouseId, productId, quantity) => {
  const res = await api.post(`${BASE}/entries`, { token: tokens.admin, body: { warehouseId, reason: 'COMPRA', lines: [{ productId, quantity }] } });
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
  await sequelize.query("DELETE FROM assets WHERE code = 'ZJ-01' AND name LIKE 'test.%'");
  await sequelize.query("DELETE FROM warehouses WHERE code = 'ZW04'");
};

beforeAll(async () => {
  assertTestDatabase();
  await cleanup();
  await deleteTestUsers();
  api = await startServer(app);
  users.superadmin = await createTestUser({ name: 'aj.super', roleCode: 'SUPERADMIN' });
  users.admin = await createTestUser({ name: 'aj.admin', roleCode: 'ADMIN' });
  users.almacenista = await createTestUser({ name: 'aj.alm', roleCode: 'ALMACENISTA' });
  users.usuario = await createTestUser({ name: 'aj.usr', roleCode: 'USUARIO' });
  for (const [key, user] of Object.entries(users)) tokens[key] = await tokenOf(user);

  ids.prin = (await one("SELECT id FROM warehouses WHERE code = 'PRIN'")).id;
  ids.comb = (await one("SELECT id FROM warehouses WHERE code = 'COMB'")).id;
  ids.inactiveWarehouse = (await one("INSERT INTO warehouses (code, name, is_active) VALUES ('ZW04', 'test.Almacén en remodelación', false) RETURNING id")).id;
  const product = async (code, name, { minStock = 0, maxStock = null, isActive = true } = {}) =>
    (
      await one(
        `INSERT INTO products (code, name, product_category_id, unit_id, min_stock, max_stock, is_active)
         VALUES (:code, :name, (SELECT id FROM product_categories WHERE code = 'COMB'), (SELECT id FROM units WHERE code = 'L'), :minStock, :maxStock, :isActive) RETURNING id`,
        { code, name, minStock, maxStock, isActive }
      )
    ).id;
  ids.diesel = await product('COMB-9941', 'test.Diésel contado', { minStock: 80, maxStock: 150 });
  ids.oil = await product('COMB-9942', 'test.Aceite contado');
  ids.race = await product('COMB-9943', 'test.Gasolina en carrera');
  ids.inactiveProduct = await product('COMB-9944', 'test.Producto dado de baja', { isActive: false });
  ids.asset = (
    await one("INSERT INTO assets (code, name, asset_category_id) VALUES ('ZJ-01', 'test.Tractor del ajuste', (SELECT id FROM asset_categories WHERE code = 'TRACTOR')) RETURNING id")
  ).id;

  await enter(ids.prin, ids.diesel, 100);
  await enter(ids.prin, ids.oil, 50);
});

afterAll(async () => {
  await api?.close();
  await cleanup();
  await deleteTestUsers();
  await sequelize.close();
});

describe('Ajuste por conteo físico (business_rules.md §2.5)', () => {
  it('FALTANTE resta en el almacén, numera AJU- sin huecos y avisa si queda bajo el mínimo', async () => {
    const before = await ajuNumber();
    const res = await adjust(adjustment([{ productId: ids.diesel, quantity: '25.5' }, { productId: ids.oil, quantity: 5 }]));
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      documentNumber: `AJU-${String(before + 1).padStart(6, '0')}`,
      movementType: 'ADJUST',
      reason: 'AJUSTE',
      reference: 'CF-2026-004',
      fromWarehouse: { code: 'PRIN' },
      toWarehouse: null,
      note: 'test.Conteo físico de noviembre',
    });
    expect(await stockOf(ids.diesel)).toBe('74.500');
    expect(await stockOf(ids.oil)).toBe('45.000');
    // 74,5 < mínimo 80: aviso que no bloquea.
    expect(res.body.meta.warnings.belowMinimum).toEqual([expect.objectContaining({ productCode: 'COMB-9941', total: '74.500', minStock: '80.000' })]);
  });

  it('SOBRANTE suma en el almacén (crea la fila si no había) y avisa si queda sobre el máximo; lo registra un SUPERADMIN', async () => {
    expect(await stockOf(ids.diesel, ids.comb)).toBeNull();
    const res = await adjust(adjustment([{ productId: ids.diesel, quantity: 80 }], { kind: 'SOBRANTE', warehouseId: ids.comb, reference: 'cf-2026-5' }), { token: tokens.superadmin });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ reference: 'CF-2026-005', fromWarehouse: null, toWarehouse: { code: 'COMB' } });
    expect(await stockOf(ids.diesel, ids.comb)).toBe('80.000');
    // 74,5 + 80 = 154,5 > máximo 150.
    expect(res.body.meta.warnings.aboveMaximum).toEqual([expect.objectContaining({ productCode: 'COMB-9941', total: '154.500', maxStock: '150.000' })]);
  });

  it('un FALTANTE mayor que la existencia → INSUFFICIENT_STOCK y no se resta nada', async () => {
    const before = await ajuNumber();
    const res = await adjust(adjustment([{ productId: ids.oil, quantity: 30 }, { productId: ids.oil, quantity: 15.001 }]));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(res.body.error.details).toEqual([expect.objectContaining({ productCode: 'COMB-9942', available: '45.000', requested: '45.001' })]);
    expect(await stockOf(ids.oil)).toBe('45.000');
    expect(await ajuNumber()).toBe(before);
    // El faltante exacto deja la existencia en 0.
    expect((await adjust(adjustment([{ productId: ids.oil, quantity: 45 }]))).status).toBe(201);
    expect(await stockOf(ids.oil)).toBe('0.000');
  });

  it('la misma Idempotency-Key devuelve el ajuste original sin aplicarlo dos veces', async () => {
    const key = randomUUID();
    const body = adjustment([{ productId: ids.oil, quantity: 3 }], { kind: 'SOBRANTE' });
    const [a, b] = await Promise.all([adjust(body, { key }), adjust(body, { key })]);
    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(a.body.data.id).toBe(b.body.data.id);
    expect(await stockOf(ids.oil)).toBe('3.000');
  });

  it('10 faltantes simultáneos de 10 L sobre 50 L: se registran exactamente 5 y la existencia queda en 0', async () => {
    await enter(ids.prin, ids.race, 50);
    const results = await Promise.all(Array.from({ length: 10 }, () => adjust(adjustment([{ productId: ids.race, quantity: 10 }]))));
    expect(results.filter((r) => r.status === 201)).toHaveLength(5);
    expect(results.filter((r) => r.status === 409 && r.body.error.code === 'INSUFFICIENT_STOCK')).toHaveLength(5);
    expect(await stockOf(ids.race)).toBe('0.000');
  });
});

describe('Validaciones del ajuste', () => {
  it('sin acta, con formato distinto de CF-AAAA-NNN o sin observación → 400 en el campo', async () => {
    const line = [{ productId: ids.diesel, quantity: 1 }];
    const noReference = await adjust({ ...adjustment(line), reference: undefined });
    expect(noReference.status).toBe(400);
    expect(noReference.body.error.details).toEqual([expect.objectContaining({ path: 'reference' })]);
    const badFormat = await adjust(adjustment(line, { reference: 'FAC-0012345' }));
    expect(badFormat.body.error.details).toEqual([expect.objectContaining({ path: 'reference' })]);
    const noNote = await adjust(adjustment(line, { note: '   ' }));
    expect(noNote.status).toBe(400);
    expect(noNote.body.error.details).toEqual([expect.objectContaining({ path: 'note' })]);
    const badKind = await adjust(adjustment(line, { kind: 'CONTEO' }));
    expect(badKind.body.error.details).toEqual([expect.objectContaining({ path: 'kind' })]);
  });

  it('acta de un año posterior a la fecha, sin líneas o con activo → error en el campo', async () => {
    const line = [{ productId: ids.diesel, quantity: 1 }];
    const future = await adjust(adjustment(line, { reference: `CF-${new Date().getFullYear() + 1}-001` }));
    expect(future.status).toBe(400);
    expect(future.body.error.details).toEqual([expect.objectContaining({ path: 'reference' })]);
    expect((await adjust(adjustment([]))).body.error.code).toBe('EMPTY_MOVEMENT');
    const withAsset = await adjust(adjustment([{ productId: ids.diesel, quantity: 1, assetId: ids.asset }]));
    expect(withAsset.body.error.code).toBe('ASSET_NOT_ALLOWED');
  });

  it('almacén o producto inactivo → INACTIVE_RESOURCE y no se ajusta nada', async () => {
    const before = await stockOf(ids.diesel);
    expect((await adjust(adjustment([{ productId: ids.diesel, quantity: 1 }], { warehouseId: ids.inactiveWarehouse, kind: 'SOBRANTE' }))).body.error.code).toBe('INACTIVE_RESOURCE');
    expect((await adjust(adjustment([{ productId: ids.diesel, quantity: 1 }, { productId: ids.inactiveProduct, quantity: 1 }]))).body.error.code).toBe('INACTIVE_RESOURCE');
    expect(await stockOf(ids.diesel)).toBe(before);
  });

  it('ALMACENISTA y USUARIO → 403 FORBIDDEN_ROLE; sin sesión → 401', async () => {
    const body = adjustment([{ productId: ids.diesel, quantity: 1 }]);
    for (const token of [tokens.almacenista, tokens.usuario]) {
      const res = await adjust(body, { token });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
    }
    expect((await api.post(`${BASE}/adjustments`, { body: {} })).status).toBe(401);
  });

  it('ADMIN con fecha atrasada (la observación ya es obligatoria) se registra; futura → MOVEMENT_DATE_INVALID', async () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    expect((await adjust(adjustment([{ productId: ids.diesel, quantity: 1 }], { kind: 'SOBRANTE', movementDate: tenDaysAgo }))).status).toBe(201);
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    expect((await adjust(adjustment([{ productId: ids.diesel, quantity: 1 }], { movementDate: tomorrow }))).body.error.code).toBe('MOVEMENT_DATE_INVALID');
  });

  it('la base rechaza un ADJUST sin acta CF- o sin observación (CHECK de la migración)', async () => {
    const insert = (reference, note) =>
      sequelize.query(
        `INSERT INTO movement_headers (document_number, movement_type, reason, reference, created_by_user_id, warehouse_to_id, note)
         VALUES ('AJU-999999', 'ADJUST', 'AJUSTE', :reference, :userId, :warehouseId, :note)`,
        { replacements: { reference, note, userId: users.admin.id, warehouseId: ids.prin } }
      );
    await expect(insert(null, 'test.Sin acta')).rejects.toThrow(/chk_movement_headers_adjust_reference/);
    await expect(insert('CF-2026-004', null)).rejects.toThrow(/chk_movement_headers_adjust_note/);
  });

  it('v_kardex cuadra con stock en cada almacén después de los ajustes', async () => {
    const rows = await sequelize.query(
      `SELECT sum(k.delta)::text AS kardex, s.quantity::text AS stock
       FROM v_kardex k JOIN stock s ON s.product_id = k.product_id AND s.warehouse_id = k.warehouse_id
       WHERE k.product_id IN (:productIds)
       GROUP BY k.product_id, k.warehouse_id, s.quantity`,
      { replacements: { productIds: [ids.diesel, ids.oil, ids.race] }, type: QueryTypes.SELECT }
    );
    expect(rows.length).toBe(4);
    for (const row of rows) expect(row.kardex).toBe(row.stock);
  });
});
