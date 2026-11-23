// Integración de la orden de retiro (HU-401) sobre inventory_test con la app real. Crea sus propios
// productos (COMB-99xx 'test.*'), activos (ZM-0x) y un almacén inactivo (ZW01). El stock inicial nace
// de entradas de prueba (ENT-96xxxx) para que v_kardex cuadre con stock (prueba de conciliación).
// Criterios del Módulo 6 (scrum_plan.md §6):
//  - 300 L de diésel; 200 L para T-01 + 150 L para T-02 → INSUFFICIENT_STOCK y no se registra nada.
//  - Retiro por CONSUMO con una línea sin activo → ASSET_REQUIRED.
//  - Retiro válido → siguiente RET-NNNNNN sin huecos y stock descontado.
//  - Solicitud repetida con el mismo idempotency_key → el movimiento original, sin duplicarlo.
import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { QueryTypes } from 'sequelize';
import app from '#src/app.js';
import { sequelize } from '#src/config/database.js';
import { startServer } from '../../helpers/http.js';
import { assertTestDatabase, createTestUser, deleteTestUsers } from '../../helpers/db.js';

let api;
let tokens = {};
let users = {};
let entrySeq = 960000;
let initialRetNumber;
let initialReferences;
const YEAR = new Date().getFullYear();
const ids = {};

const BASE = '/api/movements';
const NOTE = 'test.movimiento retiro';
const one = async (sql, replacements) => (await sequelize.query(sql, { replacements, type: QueryTypes.SELECT }))[0];
const tokenOf = async (user) =>
  (await api.post('/api/auth/login', { body: { username: user.username, password: user.password } })).body.data.accessToken;

const stockOf = async (productId, warehouseId = ids.comb) =>
  (await one('SELECT quantity::text AS q FROM stock WHERE product_id = :productId AND warehouse_id = :warehouseId', { productId, warehouseId }))?.q ?? null;
/** Contadores de la referencia automática (almacén y año); se restauran al terminar. */
const referenceNumber = async (warehouseId = ids.comb, year = YEAR) =>
  (await one('SELECT last_number AS n FROM withdrawal_reference_sequences WHERE warehouse_id = :warehouseId AND year = :year', { warehouseId, year }))?.n ?? 0;
const retNumber = async () => (await one("SELECT last_number AS n FROM document_sequences WHERE movement_type = 'OUT'")).n;
const countRet = async () => (await one('SELECT count(*)::int AS n FROM movement_headers WHERE created_by_user_id IN (:userIds) AND movement_type = \'OUT\'', { userIds: Object.values(users).map((u) => u.id) })).n;

/** Entrada de prueba (IN COMPRA) que deja `quantity` más en el almacén, con su línea, para el kardex. */
const addEntry = async (productId, quantity, warehouseId = ids.comb) => {
  entrySeq += 1;
  const header = await one(
    `INSERT INTO movement_headers (document_number, movement_type, reason, created_by_user_id, warehouse_to_id, note)
     VALUES (:doc, 'IN', 'COMPRA', :userId, :warehouseId, :note) RETURNING id`,
    { doc: `ENT-${entrySeq}`, userId: users.admin.id, warehouseId, note: NOTE }
  );
  await sequelize.query('INSERT INTO movement_lines (movement_header_id, product_id, quantity) VALUES (:headerId, :productId, :quantity)', {
    replacements: { headerId: header.id, productId, quantity },
  });
  await sequelize.query(
    `INSERT INTO stock (product_id, warehouse_id, quantity) VALUES (:productId, :warehouseId, :quantity)
     ON CONFLICT (product_id, warehouse_id) DO UPDATE SET quantity = stock.quantity + EXCLUDED.quantity`,
    { replacements: { productId, warehouseId, quantity } }
  );
};

const withdraw = (body, { token = tokens.almacenista, key } = {}) =>
  api.post(`${BASE}/withdrawals`, { token, body, headers: key ? { 'Idempotency-Key': key } : undefined });

const order = (lines, overrides = {}) => ({ warehouseId: ids.comb, reason: 'CONSUMO', receivedBy: 'test.Pedro Gómez', lines, ...overrides });

/** Los movimientos son inmutables: el trigger se apaga solo durante el borrado y solo en *_test. */
const cleanup = async () => {
  assertTestDatabase();
  await sequelize.transaction(async (transaction) => {
    const q = (sql, replacements) => sequelize.query(sql, { replacements, transaction });
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
  await sequelize.query("DELETE FROM assets WHERE code LIKE 'ZM-%' AND name LIKE 'test.%'");
  await sequelize.query("DELETE FROM warehouses WHERE code = 'ZW01'");
};

beforeAll(async () => {
  assertTestDatabase();
  await cleanup();
  await deleteTestUsers();
  api = await startServer(app);
  users.admin = await createTestUser({ name: 'mv.admin', roleCode: 'ADMIN' });
  users.almacenista = await createTestUser({ name: 'mv.alm', roleCode: 'ALMACENISTA' });
  users.almacenista2 = await createTestUser({ name: 'mv.alm2', roleCode: 'ALMACENISTA' });
  users.usuario = await createTestUser({ name: 'mv.usr', roleCode: 'USUARIO' });
  for (const [key, user] of Object.entries(users)) tokens[key] = await tokenOf(user);

  ids.comb = (await one("SELECT id FROM warehouses WHERE code = 'COMB'")).id;
  ids.tall = (await one("SELECT id FROM warehouses WHERE code = 'TALL'")).id;
  ids.inactiveWarehouse = (await one("INSERT INTO warehouses (code, name, is_active) VALUES ('ZW01', 'test.Almacén inactivo', false) RETURNING id")).id;
  const product = async (code, name, minStock) =>
    (
      await one(
        `INSERT INTO products (code, name, product_category_id, unit_id, min_stock)
         VALUES (:code, :name, (SELECT id FROM product_categories WHERE code = 'COMB'), (SELECT id FROM units WHERE code = 'L'), :minStock) RETURNING id`,
        { code, name, minStock }
      )
    ).id;
  ids.diesel = await product('COMB-9901', 'test.Diésel', 0);
  ids.oil = await product('COMB-9902', 'test.Aceite 15W40', 50);
  ids.inactiveProduct = await product('COMB-9903', 'test.Producto inactivo', 0);
  ids.gasoline = await product('COMB-9904', 'test.Gasolina', 0);
  await sequelize.query('UPDATE products SET is_active = false WHERE id = :id', { replacements: { id: ids.inactiveProduct } });
  const asset = async (code, name, isActive = true) =>
    (
      await one(
        `INSERT INTO assets (code, name, asset_category_id, is_active)
         VALUES (:code, :name, (SELECT id FROM asset_categories WHERE code = 'TRACTOR'), :isActive) RETURNING id`,
        { code, name, isActive }
      )
    ).id;
  ids.t01 = await asset('ZM-01', 'test.John Deere 6110');
  ids.t02 = await asset('ZM-02', 'test.Landini 100H');
  ids.inactiveAsset = await asset('ZM-03', 'test.Tractor de baja', false);

  await addEntry(ids.diesel, 300);
  await addEntry(ids.oil, 100);
  initialRetNumber = await retNumber();
  initialReferences = await sequelize.query('SELECT * FROM withdrawal_reference_sequences', { type: QueryTypes.SELECT });
});

afterAll(async () => {
  await api?.close();
  await cleanup();
  // Los contadores de referencia no son inmutables: vuelven a como estaban.
  await sequelize.query('DELETE FROM withdrawal_reference_sequences');
  for (const row of initialReferences ?? []) {
    await sequelize.query('INSERT INTO withdrawal_reference_sequences (warehouse_id, year, last_number) VALUES (:warehouse_id, :year, :last_number)', { replacements: row });
  }
  await deleteTestUsers();
  await sequelize.close();
});

describe('Criterios del Módulo 6', () => {
  it('300 L de diésel: 200 L para T-01 + 150 L para T-02 → INSUFFICIENT_STOCK y no se registra nada', async () => {
    const res = await withdraw(
      order([
        { productId: ids.diesel, quantity: 200, assetId: ids.t01 },
        { productId: ids.diesel, quantity: '150', assetId: ids.t02 },
      ])
    );
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(res.body.error.message).toContain('disponible 300.000, solicitado 350.000');
    expect(res.body.error.details).toEqual([expect.objectContaining({ productCode: 'COMB-9901', available: '300.000', requested: '350.000' })]);
    expect(await stockOf(ids.diesel)).toBe('300.000');
    expect(await retNumber()).toBe(initialRetNumber);
    expect(await countRet()).toBe(0);
  });

  it('CONSUMO con una línea sin activo → ASSET_REQUIRED, señalando la línea', async () => {
    const res = await withdraw(order([{ productId: ids.diesel, quantity: 10, assetId: ids.t01 }, { productId: ids.oil, quantity: 2 }]));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('ASSET_REQUIRED');
    expect(res.body.error.details).toEqual([expect.objectContaining({ path: 'lines.1.assetId', line: 2 })]);
  });

  it('retiro válido: siguiente RET-NNNNNN sin huecos (aunque antes falló uno), stock descontado y totales por producto', async () => {
    const referenceBefore = await referenceNumber();
    const res = await withdraw(
      order(
        [
          { productId: ids.diesel, quantity: 200, assetId: ids.t01, note: 'test.Arado' },
          { productId: ids.diesel, quantity: '50.5', assetId: ids.t02 },
          { productId: ids.oil, quantity: 8, assetId: ids.t01 },
        ]
      )
    );
    expect(res.status).toBe(201);
    const movement = res.body.data;
    expect(movement.documentNumber).toBe(`RET-${String(initialRetNumber + 1).padStart(6, '0')}`);
    // Referencia automática: almacén, año y correlativo de 6 dígitos del almacén en el año.
    expect(movement.reference).toBe(`COMB-${YEAR}-${String(referenceBefore + 1).padStart(6, '0')}`);
    expect(movement).toMatchObject({
      movementType: 'OUT',
      reason: 'CONSUMO',
      receivedBy: 'test.Pedro Gómez',
      fromWarehouse: { code: 'COMB' },
      toWarehouse: null,
      createdBy: { username: 'test.mv.alm' },
    });
    expect(movement.lines.map((l) => [l.product.code, l.quantity, l.asset.code, l.note])).toEqual([
      ['COMB-9901', '200.000', 'ZM-01', 'test.Arado'],
      ['COMB-9901', '50.500', 'ZM-02', null],
      ['COMB-9902', '8.000', 'ZM-01', null],
    ]);
    expect(movement.totals.map((t) => [t.product.code, t.quantity, t.lines])).toEqual([
      ['COMB-9901', '250.500', 2],
      ['COMB-9902', '8.000', 1],
    ]);
    expect(res.body.meta).toMatchObject({ duplicated: false });
    expect(await stockOf(ids.diesel)).toBe('49.500');
    expect(await stockOf(ids.oil)).toBe('92.000');

    const detail = await api.get(`${BASE}/${movement.id}`, { token: tokens.usuario });
    expect(detail.status).toBe(200);
    expect(detail.body.data.documentNumber).toBe(movement.documentNumber);
  });

  it('el mismo Idempotency-Key devuelve el movimiento original (200) sin descontar dos veces; otro usuario con esa clave → 409', async () => {
    const key = randomUUID();
    const body = order([{ productId: ids.oil, quantity: 2, assetId: ids.t02 }]);
    const first = await withdraw(body, { key });
    expect(first.status).toBe(201);
    const again = await withdraw(body, { key });
    expect(again.status).toBe(200);
    expect(again.body.meta.duplicated).toBe(true);
    expect(again.body.data.id).toBe(first.body.data.id);
    expect(await stockOf(ids.oil)).toBe('90.000');
    const other = await withdraw(body, { key, token: tokens.almacenista2 });
    expect(other.status).toBe(409);
    expect(other.body.error.code).toBe('DUPLICATE_REQUEST');
    const badKey = await withdraw(body, { key: 'no-es-un-uuid' });
    expect(badKey.status).toBe(400);
  });

  it('dos solicitudes simultáneas con la misma clave: un solo movimiento', async () => {
    const key = randomUUID();
    const body = order([{ productId: ids.oil, quantity: 1, assetId: ids.t01 }]);
    const [a, b] = await Promise.all([withdraw(body, { key }), withdraw(body, { key })]);
    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(a.body.data.id).toBe(b.body.data.id);
    expect(await stockOf(ids.oil)).toBe('89.000');
  });
});

describe('Reglas de la orden (business_rules.md §2.3, §3 y §4)', () => {
  it('producto + activo repetido se consolida en una línea y se avisa; el producto bajo mínimo se avisa sin bloquear', async () => {
    const res = await withdraw(
      order([
        { productId: ids.oil, quantity: 30, assetId: ids.t01 },
        { productId: ids.oil, quantity: 15, assetId: ids.t01 },
      ])
    );
    expect(res.status).toBe(201);
    expect(res.body.data.lines).toEqual([expect.objectContaining({ quantity: '45.000' })]);
    expect(res.body.meta.warnings.consolidated).toEqual([{ productId: ids.oil, assetId: ids.t01, lines: [1, 2] }]);
    // 89 − 45 = 44, por debajo del mínimo de 50.
    expect(res.body.meta.warnings.belowMinimum).toEqual([expect.objectContaining({ productCode: 'COMB-9902', total: '44.000', minStock: '50.000' })]);
  });

  it('PRESTAMO sin recibido por → 400 en receivedBy; DESECHO sin observación → 400 en note; DESECHO sin activo sí se admite', async () => {
    const loan = await withdraw(order([{ productId: ids.oil, quantity: 1, assetId: ids.t01 }], { reason: 'PRESTAMO', receivedBy: null }));
    expect(loan.status).toBe(400);
    expect(loan.body.error.details).toEqual([expect.objectContaining({ path: 'receivedBy' })]);
    const waste = await withdraw(order([{ productId: ids.oil, quantity: 1 }], { reason: 'DESECHO' }));
    expect(waste.status).toBe(400);
    expect(waste.body.error.details).toEqual([expect.objectContaining({ path: 'note' })]);
    const ok = await withdraw(order([{ productId: ids.oil, quantity: 1 }], { reason: 'DESECHO', note: 'test.Envase dañado' }));
    expect(ok.status).toBe(201);
    expect(ok.body.data.lines[0].asset).toBeNull();
  });

  it('motivo de entrada → INVALID_MOVEMENT_REASON; sin líneas → EMPTY_MOVEMENT; cantidad 0 o con 4 decimales → 400', async () => {
    expect((await withdraw(order([{ productId: ids.oil, quantity: 1 }], { reason: 'COMPRA' }))).body.error.code).toBe('INVALID_MOVEMENT_REASON');
    expect((await withdraw(order([]))).body.error.code).toBe('EMPTY_MOVEMENT');
    expect((await withdraw(order([{ productId: ids.oil, quantity: 0, assetId: ids.t01 }]))).status).toBe(400);
    expect((await withdraw(order([{ productId: ids.oil, quantity: '1.2345', assetId: ids.t01 }]))).status).toBe(400);
  });

  it('almacén, producto o activo inactivos → INACTIVE_RESOURCE; inexistente → NOT_FOUND', async () => {
    const inactive = await Promise.all([
      withdraw(order([{ productId: ids.oil, quantity: 1, assetId: ids.t01 }], { warehouseId: ids.inactiveWarehouse })),
      withdraw(order([{ productId: ids.inactiveProduct, quantity: 1, assetId: ids.t01 }])),
      withdraw(order([{ productId: ids.oil, quantity: 1, assetId: ids.inactiveAsset }])),
    ]);
    expect(inactive.map((r) => r.body.error.code)).toEqual(['INACTIVE_RESOURCE', 'INACTIVE_RESOURCE', 'INACTIVE_RESOURCE']);
    expect((await withdraw(order([{ productId: 999999, quantity: 1, assetId: ids.t01 }]))).body.error.code).toBe('NOT_FOUND');
  });

  it('fechas: futura → MOVEMENT_DATE_INVALID; ALMACENISTA con 5 días de atraso → MOVEMENT_DATE_INVALID; ADMIN, solo con observación', async () => {
    const future = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const line = [{ productId: ids.diesel, quantity: 1, assetId: ids.t01 }];
    expect((await withdraw(order(line, { movementDate: future }))).body.error.code).toBe('MOVEMENT_DATE_INVALID');
    expect((await withdraw(order(line, { movementDate: fiveDaysAgo }))).body.error.code).toBe('MOVEMENT_DATE_INVALID');
    const recent = await withdraw(order(line, { movementDate: twoDaysAgo }));
    expect(recent.status).toBe(201);
    expect(new Date(recent.body.data.movementDate).toISOString()).toBe(twoDaysAgo);
    const adminNoNote = await withdraw(order(line, { movementDate: fiveDaysAgo }), { token: tokens.admin });
    expect(adminNoNote.status).toBe(400);
    expect(adminNoNote.body.error.details).toEqual([expect.objectContaining({ path: 'note' })]);
    const adminWithNote = await withdraw(order(line, { movementDate: fiveDaysAgo, note: 'test.Orden en papel cargada tarde' }), { token: tokens.admin });
    expect(adminWithNote.status).toBe(201);
  });

  it('USUARIO no registra (403 FORBIDDEN_ROLE) pero consulta; sin sesión → 401; movimiento inexistente → 404', async () => {
    const res = await withdraw(order([{ productId: ids.diesel, quantity: 1, assetId: ids.t01 }]), { token: tokens.usuario });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
    expect((await api.post(`${BASE}/withdrawals`, { body: {} })).status).toBe(401);
    expect((await api.get(`${BASE}/999999`, { token: tokens.usuario })).status).toBe(404);
  });
});

describe('Orden de trabajo del taller', () => {
  it('se guarda en su campo, en mayúsculas y con el prefijo OT- aunque no se escriba; es opcional', async () => {
    const line = [{ productId: ids.oil, quantity: 1, assetId: ids.t01 }];
    const typed = await withdraw(order(line, { workOrder: ' ot-2026-0153 ' }));
    expect(typed.status).toBe(201);
    expect(typed.body.data).toMatchObject({ workOrder: 'OT-2026-0153', reference: expect.stringMatching(/^COMB-\d{4}-\d{6}$/) });
    const bare = await withdraw(order(line, { workOrder: '2026-0154' }));
    expect(bare.body.data.workOrder).toBe('OT-2026-0154');
    const none = await withdraw(order(line));
    expect(none.body.data.workOrder).toBeNull();
    const detail = await api.get(`${BASE}/${typed.body.data.id}`, { token: tokens.usuario });
    expect(detail.body.data.workOrder).toBe('OT-2026-0153');
  });

  it('con símbolos → 400 en workOrder; la base de datos rechaza el formato y la OT en un movimiento que no es retiro', async () => {
    const bad = await withdraw(order([{ productId: ids.oil, quantity: 1, assetId: ids.t01 }], { workOrder: 'OT-2026/01#' }));
    expect(bad.status).toBe(400);
    expect(bad.body.error.details).toEqual([expect.objectContaining({ path: 'workOrder' })]);
    const insert = (type, workOrder) =>
      sequelize.query(
        `INSERT INTO movement_headers (document_number, movement_type, reason, work_order, created_by_user_id, warehouse_to_id, note)
         VALUES ('ENT-969998', :type, 'COMPRA', :workOrder, :userId, :warehouseId, :note)`,
        { replacements: { type, workOrder, userId: users.admin.id, warehouseId: ids.comb, note: NOTE } }
      );
    await expect(insert('IN', 'OT-2026-0001')).rejects.toMatchObject({ parent: { constraint: 'chk_movement_headers_work_order_type' } });
    await expect(insert('IN', 'ot 1')).rejects.toMatchObject({ parent: { constraint: 'chk_movement_headers_work_order_format' } });
  });
});

describe('Referencia automática ({ALMACÉN}-{AÑO}-{NNNNNN})', () => {
  it('no se acepta una referencia escrita; los rechazos no consumen número; cada almacén lleva su propio correlativo', async () => {
    const manual = await withdraw(order([{ productId: ids.oil, quantity: 1, assetId: ids.t01 }], { reference: 'OT-2026-0153' }));
    expect(manual.status).toBe(400);
    const before = await referenceNumber();
    expect((await withdraw(order([{ productId: ids.oil, quantity: 999999, assetId: ids.t01 }]))).status).toBe(409);
    expect(await referenceNumber()).toBe(before);

    await addEntry(ids.oil, 5, ids.tall);
    const tallBefore = await referenceNumber(ids.tall);
    const tall = await withdraw(order([{ productId: ids.oil, quantity: 1, assetId: ids.t01 }], { warehouseId: ids.tall }));
    expect(tall.status).toBe(201);
    expect(tall.body.data.reference).toBe(`TALL-${YEAR}-${String(tallBefore + 1).padStart(6, '0')}`);
    const comb = await withdraw(order([{ productId: ids.oil, quantity: 1, assetId: ids.t01 }]));
    expect(comb.body.data.reference).toBe(`COMB-${YEAR}-${String(before + 1).padStart(6, '0')}`);
  });

  it('la base de datos rechaza dos órdenes con la misma referencia automática', async () => {
    const [existing] = await sequelize.query(
      "SELECT reference FROM movement_headers WHERE movement_type = 'OUT' AND reference LIKE 'COMB-%' ORDER BY id DESC LIMIT 1",
      { type: QueryTypes.SELECT }
    );
    const insert = sequelize.query(
      `INSERT INTO movement_headers (document_number, movement_type, reason, reference, created_by_user_id, warehouse_from_id, note)
       VALUES ('RET-969999', 'OUT', 'DESECHO', :reference, :userId, :warehouseId, :note)`,
      { replacements: { reference: existing.reference, userId: users.admin.id, warehouseId: ids.comb, note: NOTE } }
    );
    await expect(insert).rejects.toMatchObject({ parent: { constraint: 'uq_movement_headers_withdrawal_reference' } });
  });
});

describe('Concurrencia y conciliación', () => {
  it('5 retiros simultáneos de 10 L sobre 30 L: se registran 3, se rechazan 2 y el stock queda en 0', async () => {
    await addEntry(ids.gasoline, 30);
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) => withdraw(order([{ productId: ids.gasoline, quantity: 10, assetId: i % 2 ? ids.t01 : ids.t02 }])))
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 201, 201, 409, 409]);
    expect(results.filter((r) => r.status === 409).every((r) => r.body.error.code === 'INSUFFICIENT_STOCK')).toBe(true);
    expect(await stockOf(ids.gasoline)).toBe('0.000');
    // Números consecutivos, sin huecos ni repetidos.
    const numbers = results.filter((r) => r.status === 201).map((r) => Number(r.body.data.documentNumber.slice(4))).sort((a, b) => a - b);
    expect(numbers[2] - numbers[0]).toBe(2);
    // Las referencias también son consecutivas y distintas.
    const refs = results.filter((r) => r.status === 201).map((r) => Number(r.body.data.reference.slice(-6))).sort((a, b) => a - b);
    expect(new Set(refs).size).toBe(3);
    expect(refs[2] - refs[0]).toBe(2);
  });

  it('la suma de v_kardex por producto y almacén coincide con stock', async () => {
    const rows = await sequelize.query(
      `SELECT k.product_id, k.warehouse_id, sum(k.delta)::text AS kardex, s.quantity::text AS stock
       FROM v_kardex k JOIN stock s ON s.product_id = k.product_id AND s.warehouse_id = k.warehouse_id
       WHERE k.product_id IN (:productIds)
       GROUP BY k.product_id, k.warehouse_id, s.quantity`,
      { replacements: { productIds: [ids.diesel, ids.oil, ids.gasoline] }, type: QueryTypes.SELECT }
    );
    // Diésel, aceite y gasolina en COMB, más el aceite de la prueba de TALL.
    expect(rows).toHaveLength(4);
    for (const row of rows) expect(row.kardex).toBe(row.stock);
  });
});

describe('GET /api/stock/availability', () => {
  it('existencia por almacén de los productos pedidos (0 si nunca tuvo); producto inexistente → 404', async () => {
    const res = await api.get(`/api/stock/availability?warehouseId=${ids.comb}&productIds=${ids.oil},${ids.inactiveProduct}`, { token: tokens.usuario });
    expect(res.status).toBe(200);
    expect(res.body.data.warehouse.code).toBe('COMB');
    expect(res.body.data.items).toEqual([
      { productId: ids.oil, code: 'COMB-9902', unitCode: 'L', available: expect.stringMatching(/^\d+\.000$/) },
      { productId: ids.inactiveProduct, code: 'COMB-9903', unitCode: 'L', available: '0.000' },
    ]);
    expect((await api.get(`/api/stock/availability?warehouseId=${ids.comb}&productIds=999999`, { token: tokens.usuario })).status).toBe(404);
    expect((await api.get(`/api/stock/availability?warehouseId=${ids.comb}&productIds=abc`, { token: tokens.usuario })).status).toBe(400);
  });
});
