// Integración de productos (HU-204) con la app real sobre inventory_test. Usa los productos y
// categorías sembrados y crea los suyos en categorías de prueba ('test.*', códigos 'Z…'), para que
// los correlativos sean predecibles. Las existencias y los movimientos se insertan con SQL directo.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { QueryTypes } from 'sequelize';
import app from '#src/app.js';
import { sequelize } from '#src/config/database.js';
import { startServer } from '../../helpers/http.js';
import { assertTestDatabase, createTestUser, deleteTestUsers } from '../../helpers/db.js';

let api;
let admin;
let almacenista;
let adminUser;
let ids = {};
let documentSeq = 990000;

const BASE = '/api/products';
const tokenOf = async (user) =>
  (await api.post('/api/auth/login', { body: { username: user.username, password: user.password } })).body.data.accessToken;
const create = (body, token = admin) => api.post(BASE, { token, body });
const patch = (id, body, token = admin) => api.patch(`${BASE}/${id}`, { token, body });

const one = async (sql, replacements = {}) => (await sequelize.query(sql, { replacements, type: QueryTypes.SELECT }))[0];
const idOf = async (table, code) => (await one(`SELECT id FROM ${table} WHERE code = :code`, { code })).id;

/** Existencias directas en el almacén COMB (el stock solo debería nacer de movimientos). */
const setStock = (productId, quantity) =>
  sequelize.query(
    `INSERT INTO stock (product_id, warehouse_id, quantity) VALUES (:productId, :warehouseId, :quantity)
     ON CONFLICT (product_id, warehouse_id) DO UPDATE SET quantity = EXCLUDED.quantity`,
    { replacements: { productId, warehouseId: ids.warehouse, quantity } }
  );

/** Una entrada por compra con una línea del producto. */
const addMovement = async (productId) => {
  documentSeq += 1;
  const header = await one(
    `INSERT INTO movement_headers (document_number, movement_type, reason, created_by_user_id, warehouse_to_id, note)
     VALUES (:doc, 'IN', 'COMPRA', :userId, :warehouseId, 'test.movimiento productos') RETURNING id`,
    { doc: `ENT-${documentSeq}`, userId: adminUser.id, warehouseId: ids.warehouse }
  );
  await sequelize.query('INSERT INTO movement_lines (movement_header_id, product_id, quantity) VALUES (:headerId, :productId, 1)', {
    replacements: { headerId: header.id, productId },
  });
};

/**
 * Los movimientos son inmutables (trg_movements_immutable): para limpiar los de prueba se apaga el
 * trigger solo durante el borrado, y solo en la base *_test.
 */
const cleanup = async () => {
  assertTestDatabase();
  await sequelize.transaction(async (transaction) => {
    const q = (sql) => sequelize.query(sql, { transaction });
    await q('ALTER TABLE movement_lines DISABLE TRIGGER trg_movements_immutable');
    await q('ALTER TABLE movement_headers DISABLE TRIGGER trg_movements_immutable');
    await q("DELETE FROM movement_lines WHERE movement_header_id IN (SELECT id FROM movement_headers WHERE note = 'test.movimiento productos')");
    await q("DELETE FROM movement_headers WHERE note = 'test.movimiento productos'");
    await q('ALTER TABLE movement_lines ENABLE TRIGGER trg_movements_immutable');
    await q('ALTER TABLE movement_headers ENABLE TRIGGER trg_movements_immutable');
  });
  await sequelize.query("DELETE FROM stock WHERE product_id IN (SELECT id FROM products WHERE name LIKE 'test.%')");
  await sequelize.query("DELETE FROM products WHERE name LIKE 'test.%'");
  await sequelize.query("DELETE FROM product_categories WHERE name LIKE 'test.%' AND parent_id IS NOT NULL");
  await sequelize.query("DELETE FROM product_categories WHERE name LIKE 'test.%'");
  await sequelize.query("DELETE FROM units WHERE name LIKE 'test.%'");
};

beforeAll(async () => {
  assertTestDatabase();
  await cleanup();
  await deleteTestUsers();
  api = await startServer(app);
  adminUser = await createTestUser({ name: 'pr.admin', roleCode: 'ADMIN' });
  admin = await tokenOf(adminUser);
  almacenista = await tokenOf(await createTestUser({ name: 'pr.alm', roleCode: 'ALMACENISTA' }));

  const cat = async (code, name, parentId = null) =>
    (await one('INSERT INTO product_categories (code, name, parent_id) VALUES (:code, :name, :parentId) RETURNING id', { code, name, parentId })).id;
  ids = {
    za: await cat('ZPAA', 'test.Productos A'),
    zb: await cat('ZPBB', 'test.Productos B'),
    litro: await idOf('units', 'L'),
    kilo: await idOf('units', 'KG'),
    warehouse: await idOf('warehouses', 'COMB'),
  };
  ids.zaChild = await cat('ZPAC', 'test.Productos A hija', ids.za);
});

afterAll(async () => {
  await api?.close();
  await cleanup();
  await deleteTestUsers();
  await sequelize.close();
});

describe('Consultas (todos los roles)', () => {
  it('lista los sembrados con categoría, unidad y cantidades con 3 decimales', async () => {
    const res = await api.get(`${BASE}?search=diésel`, { token: almacenista });
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({
      code: 'COMB-0001',
      category: { code: 'COMB' },
      unit: { code: 'L' },
      minStock: '500.000',
      maxStock: '10000.000',
    });
  });

  it('el filtro de categoría incluye las subcategorías: INSU trae FERT-0001 y HERB-0001', async () => {
    const res = await api.get(`${BASE}?categoryId=${await idOf('product_categories', 'INSU')}`, { token: almacenista });
    expect(res.body.data.map((p) => p.code)).toEqual(expect.arrayContaining(['FERT-0001', 'HERB-0001']));
    expect(res.body.data.every((p) => ['FERT', 'HERB', 'INSE', 'INSU'].includes(p.category.code))).toBe(true);
  });

  it('withStockIn: solo los productos con existencia > 0 en ese almacén (origen de un traslado)', async () => {
    const categoryId = (await one("INSERT INTO product_categories (code, name) VALUES ('ZPST', 'test.Productos con stock') RETURNING id")).id;
    const product = async (name) => (await create({ name, categoryId, unitId: ids.litro })).body.data.id;
    const withStock = await product('test.Con existencia en COMB');
    const empty = await product('test.Con stock 0 en COMB');
    const none = await product('test.Sin fila en COMB');
    await setStock(withStock, '5.5');
    await setStock(empty, '0');
    const res = await api.get(`${BASE}?withStockIn=${ids.warehouse}&categoryId=${categoryId}&limit=100`, { token: almacenista });
    expect(res.status).toBe(200);
    const listed = res.body.data.map((p) => p.id);
    expect(listed).toContain(withStock);
    expect(res.body.data.find((p) => p.id === withStock).stock.inWarehouse).toEqual({ warehouseId: ids.warehouse, quantity: '5.500' });
    expect(listed).not.toContain(empty);
    expect(listed).not.toContain(none);
    expect(res.body.meta.filters).toMatchObject({ withStockIn: ids.warehouse });
    expect((await api.get(`${BASE}?withStockIn=abc`, { token: almacenista })).status).toBe(400);
  });

  it('GET /:id inexistente → 404', async () => {
    expect((await api.get(`${BASE}/99999999`, { token: almacenista })).status).toBe(404);
  });
});

describe('Código sugerido (regla 1)', () => {
  it('LUBR con LUBR-0002 como último → sugiere LUBR-0003 (criterio del Módulo 4)', async () => {
    const res = await api.get(`${BASE}/next-code?categoryId=${await idOf('product_categories', 'LUBR')}`, { token: admin });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ categoryCode: 'LUBR', code: 'LUBR-0003' });
  });

  it('sin código se asigna el correlativo; con uno manual, el siguiente parte del mayor', async () => {
    const first = await create({ name: 'test.Primero', categoryId: ids.za, unitId: ids.litro });
    expect(first.status).toBe(201);
    expect(first.body.data).toMatchObject({ code: 'ZPAA-0001', minStock: '0.000', maxStock: null, hasMovements: false });

    expect((await create({ code: 'zpaa-0010', name: 'test.Manual', categoryId: ids.za, unitId: ids.litro })).body.data.code).toBe('ZPAA-0010');
    expect((await create({ name: 'test.Siguiente', categoryId: ids.za, unitId: ids.litro })).body.data.code).toBe('ZPAA-0011');
  });

  it('altas simultáneas en la misma categoría reciben códigos distintos', async () => {
    const results = await Promise.all(
      [1, 2, 3, 4, 5].map((n) => create({ name: `test.Simultáneo ${n}`, categoryId: ids.zb, unitId: ids.kilo }))
    );
    expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201, 201]);
    expect(results.map((r) => r.body.data.code).sort()).toEqual(['ZPBB-0001', 'ZPBB-0002', 'ZPBB-0003', 'ZPBB-0004', 'ZPBB-0005']);
  });

  it('prefijo de otra categoría, código repetido o categoría inactiva → error del catálogo', async () => {
    const wrong = await create({ code: 'LUBR-0099', name: 'test.Prefijo', categoryId: ids.za, unitId: ids.litro });
    expect(wrong.body.error).toMatchObject({ code: 'INVALID_CODE_FORMAT', details: [expect.objectContaining({ path: 'code' })] });
    expect((await create({ code: 'ZPAA-0001', name: 'test.Repetido', categoryId: ids.za, unitId: ids.litro })).body.error.code).toBe(
      'DUPLICATE_CODE'
    );
    expect((await create({ name: 'Diésel', categoryId: ids.za, unitId: ids.litro })).body.error.code).toBe('DUPLICATE_CODE');

    const inactive = (await one("INSERT INTO product_categories (code, name, is_active) VALUES ('ZPIN', 'test.Inactiva', false) RETURNING id")).id;
    expect((await create({ name: 'test.En inactiva', categoryId: inactive, unitId: ids.litro })).body.error.code).toBe('INACTIVE_RESOURCE');
  });

  it('ALMACENISTA consulta pero no crea ni pide códigos → 403', async () => {
    expect((await create({ name: 'test.Sin permiso', categoryId: ids.za, unitId: ids.litro }, almacenista)).body.error.code).toBe('FORBIDDEN_ROLE');
    expect((await api.get(`${BASE}/next-code?categoryId=${ids.za}`, { token: almacenista })).status).toBe(403);
  });
});

describe('Mínimo y máximo (regla 2)', () => {
  it('min > max → 400; al editar se compara contra lo guardado', async () => {
    const bad = await create({ name: 'test.Rango', categoryId: ids.za, unitId: ids.litro, minStock: 10, maxStock: '9.5' });
    expect(bad.body.error).toMatchObject({ code: 'VALIDATION_ERROR', details: [expect.objectContaining({ path: 'maxStock' })] });

    const ok = (await create({ name: 'test.Rango ok', categoryId: ids.za, unitId: ids.litro, minStock: '10', maxStock: '10' })).body.data;
    expect(ok).toMatchObject({ minStock: '10.000', maxStock: '10.000' });
    expect((await patch(ok.id, { minStock: '10.5' })).status).toBe(400);
    expect((await patch(ok.id, { maxStock: null, minStock: '10.5' })).body.data).toMatchObject({ minStock: '10.500', maxStock: null });
    expect((await create({ name: 'test.Decimales', categoryId: ids.za, unitId: ids.litro, minStock: '1.2345' })).status).toBe(400);
  });
});

describe('Unidad con movimientos (regla 3)', () => {
  it('con movimientos → 409 UNIT_CHANGE_FORBIDDEN (criterio del Módulo 4); categoría y código bloqueados; el nombre sí cambia', async () => {
    const product = (await create({ name: 'test.Con movimientos', categoryId: ids.za, unitId: ids.litro })).body.data;
    expect((await patch(product.id, { unitId: ids.kilo })).status).toBe(200);
    await addMovement(product.id);

    const unit = await patch(product.id, { unitId: ids.litro });
    expect(unit.status).toBe(409);
    expect(unit.body.error).toMatchObject({ code: 'UNIT_CHANGE_FORBIDDEN', details: [expect.objectContaining({ path: 'unitId' })] });
    expect((await patch(product.id, { categoryId: ids.zb })).body.error.code).toBe('HAS_DEPENDENCIES');

    const renamed = await patch(product.id, { name: 'test.Con movimientos (renombrado)' });
    expect(renamed.body.data).toMatchObject({ hasMovements: true, unit: { code: 'KG' } });
  });

  it('sin movimientos, cambiar de categoría le asigna el siguiente código de la nueva', async () => {
    const product = (await create({ name: 'test.Se muda', categoryId: ids.za, unitId: ids.litro })).body.data;
    const moved = await patch(product.id, { categoryId: ids.zaChild });
    expect(moved.body.data).toMatchObject({ code: 'ZPAC-0001', category: { code: 'ZPAC' } });
  });
});

describe('Desactivar (regla 4)', () => {
  it('con existencias → 409 HAS_STOCK; con stock 0 se desactiva; se reactiva', async () => {
    const product = (await create({ name: 'test.Con stock', categoryId: ids.za, unitId: ids.litro })).body.data;
    await setStock(product.id, '12.500');
    expect((await api.get(`${BASE}/${product.id}`, { token: almacenista })).body.data.stock).toEqual({
      total: '12.500',
      warehousesWithStock: 1,
      isEmpty: false,
    });

    const blocked = await api.post(`${BASE}/${product.id}/deactivate`, { token: admin });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toMatchObject({ code: 'HAS_STOCK', details: { warehousesWithStock: 1 } });

    await setStock(product.id, 0);
    expect((await api.post(`${BASE}/${product.id}/deactivate`, { token: admin })).body.data.isActive).toBe(false);
    expect((await api.get(`${BASE}?isActive=false&search=test.Con stock`, { token: almacenista })).body.data).toHaveLength(1);
    expect((await api.post(`${BASE}/${product.id}/activate`, { token: admin })).body.data.isActive).toBe(true);
  });

  it('ALMACENISTA no edita ni desactiva', async () => {
    const id = await idOf('products', 'COMB-0001');
    expect((await patch(id, { name: 'test.X' }, almacenista)).status).toBe(403);
    expect((await api.post(`${BASE}/${id}/deactivate`, { token: almacenista })).status).toBe(403);
  });
});
