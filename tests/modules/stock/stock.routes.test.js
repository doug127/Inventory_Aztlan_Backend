// Integración de la consulta de existencias con alertas (HU-407) sobre inventory_test con la app real.
// Crea una categoría de prueba con una hija (ZSTK › ZSTH) y sus productos 'test.*'; el filtro por esa
// categoría aísla los resultados de los demás datos. Las existencias se insertan con SQL directo.
// Reglas de business_rules.md §7: el estado sale del stock total de todos los almacenes.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { QueryTypes } from 'sequelize';
import app from '#src/app.js';
import { sequelize } from '#src/config/database.js';
import { startServer } from '../../helpers/http.js';
import { assertTestDatabase, createTestUser, deleteTestUsers } from '../../helpers/db.js';

let api;
let token;
const ids = {};

const one = async (sql, replacements) => (await sequelize.query(sql, { replacements, type: QueryTypes.SELECT }))[0];
const list = (query) => api.get(`/api/stock?categoryId=${ids.root}&${query}`, { token });
const rows = (res) => res.body.data.map((r) => [r.product.code, r.warehouse?.code ?? null, r.quantity, r.status]);

const cleanup = async () => {
  assertTestDatabase();
  await sequelize.query("DELETE FROM stock WHERE product_id IN (SELECT id FROM products WHERE name LIKE 'test.Stock%')");
  await sequelize.query("DELETE FROM products WHERE name LIKE 'test.Stock%'");
  await sequelize.query("DELETE FROM product_categories WHERE code = 'ZSTH'");
  await sequelize.query("DELETE FROM product_categories WHERE code = 'ZSTK'");
};

beforeAll(async () => {
  assertTestDatabase();
  await cleanup();
  await deleteTestUsers();
  api = await startServer(app);
  const user = await createTestUser({ name: 'st.usr', roleCode: 'USUARIO' });
  token = (await api.post('/api/auth/login', { body: { username: user.username, password: user.password } })).body.data.accessToken;

  ids.comb = (await one("SELECT id FROM warehouses WHERE code = 'COMB'")).id;
  ids.prin = (await one("SELECT id FROM warehouses WHERE code = 'PRIN'")).id;
  ids.root = (await one("INSERT INTO product_categories (code, name) VALUES ('ZSTK', 'test.Stock raíz') RETURNING id")).id;
  ids.child = (await one("INSERT INTO product_categories (code, name, parent_id) VALUES ('ZSTH', 'test.Stock hija', :root) RETURNING id", { root: ids.root })).id;
  const product = async (code, name, categoryId, { min = 0, max = null, isActive = true } = {}) =>
    (
      await one(
        `INSERT INTO products (code, name, product_category_id, unit_id, min_stock, max_stock, is_active)
         VALUES (:code, :name, :categoryId, (SELECT id FROM units WHERE code = 'L'), :min, :max, :isActive) RETURNING id`,
        { code, name, categoryId, min, max, isActive }
      )
    ).id;
  const stock = (productId, warehouseId, quantity) =>
    sequelize.query('INSERT INTO stock (product_id, warehouse_id, quantity) VALUES (:productId, :warehouseId, :quantity)', { replacements: { productId, warehouseId, quantity } });

  ids.normal = await product('ZSTK-0001', 'test.Stock normal', ids.root, { min: 10, max: 100 });
  ids.low = await product('ZSTK-0002', 'test.Stock bajo mínimo', ids.root, { min: 100 });
  ids.empty = await product('ZSTK-0003', 'test.Stock sin existencia', ids.root, { min: 5 });
  ids.inactive = await product('ZSTK-0004', 'test.Stock descontinuado', ids.root, { isActive: false });
  ids.high = await product('ZSTH-0001', 'test.Stock sobre máximo', ids.child, { max: 10 });
  await stock(ids.normal, ids.comb, 30);
  await stock(ids.normal, ids.prin, 20.5);
  await stock(ids.low, ids.comb, 40);
  await stock(ids.low, ids.prin, 0);
  await stock(ids.high, ids.prin, 25);
});

afterAll(async () => {
  await api?.close();
  await cleanup();
  await deleteTestUsers();
  await sequelize.close();
});

describe('Existencias por producto (GET /api/stock)', () => {
  it('una fila por producto activo con su total, desglose por almacén y estado; la categoría incluye las subcategorías', async () => {
    const res = await list('');
    expect(res.status).toBe(200);
    expect(rows(res)).toEqual([
      ['ZSTH-0001', null, '25.000', 'SOBRE_MAXIMO'],
      ['ZSTK-0001', null, '50.500', 'NORMAL'],
      ['ZSTK-0002', null, '40.000', 'BAJO_MINIMO'],
      ['ZSTK-0003', null, '0.000', 'BAJO_MINIMO'],
    ]);
    const normal = res.body.data[1];
    expect(normal).toMatchObject({
      product: { code: 'ZSTK-0001', name: 'test.Stock normal', unitCode: 'L' },
      category: { code: 'ZSTK' },
      total: '50.500',
      minStock: '10.000',
      maxStock: '100.000',
      warehouses: [expect.objectContaining({ code: 'COMB', quantity: '30.000' }), expect.objectContaining({ code: 'PRIN', quantity: '20.500' })],
    });
    // Un almacén con existencia 0 no aparece en el desglose.
    expect(res.body.data[2].warehouses.map((w) => w.code)).toEqual(['COMB']);
    expect(res.body.meta.summary).toEqual({ total: 4, normal: 1, bajoMinimo: 2, sobreMaximo: 1 });
    expect(res.body.meta.pagination).toMatchObject({ page: 1, limit: 10, totalItems: 4 });
  });

  it('con almacén: solo lo que tiene existencia ahí; quantity es la del almacén y el estado sigue el total', async () => {
    const res = await list(`warehouseId=${ids.comb}`);
    expect(rows(res)).toEqual([
      ['ZSTK-0001', 'COMB', '30.000', 'NORMAL'],
      ['ZSTK-0002', 'COMB', '40.000', 'BAJO_MINIMO'],
    ]);
    expect(res.body.data[0].total).toBe('50.500');
    expect(res.body.meta.summary).toEqual({ total: 2, normal: 1, bajoMinimo: 1, sobreMaximo: 0 });
  });

  it('subcategoría, búsqueda y paginación', async () => {
    expect(rows(await api.get(`/api/stock?categoryId=${ids.child}`, { token }))).toEqual([['ZSTH-0001', null, '25.000', 'SOBRE_MAXIMO']]);
    expect(rows(await list('search=bajo'))).toEqual([['ZSTK-0002', null, '40.000', 'BAJO_MINIMO']]);
    const page2 = await list('limit=3&page=2');
    expect(rows(page2)).toEqual([['ZSTK-0003', null, '0.000', 'BAJO_MINIMO']]);
    expect(page2.body.meta.pagination).toMatchObject({ totalPages: 2, hasPrevPage: true, hasNextPage: false });
  });
});

describe('Alertas (business_rules.md §7)', () => {
  it('alert filtra por estado y el resumen sigue contando todo el alcance', async () => {
    expect(rows(await list('alert=BAJO_MINIMO')).map((r) => r[0])).toEqual(['ZSTK-0002', 'ZSTK-0003']);
    expect(rows(await list('alert=SOBRE_MAXIMO')).map((r) => r[0])).toEqual(['ZSTH-0001']);
    const any = await list('alert=true');
    expect(rows(any).map((r) => r[0])).toEqual(['ZSTH-0001', 'ZSTK-0002', 'ZSTK-0003']);
    expect(any.body.meta.filters).toMatchObject({ alert: 'CON_ALERTA' });
    expect(any.body.meta.summary).toEqual({ total: 4, normal: 1, bajoMinimo: 2, sobreMaximo: 1 });
  });

  it('coincide con la vista v_stock_alerts', async () => {
    const view = await sequelize.query(
      "SELECT product_code AS code, alert FROM v_stock_alerts WHERE product_code LIKE 'ZST%' ORDER BY product_code",
      { type: QueryTypes.SELECT }
    );
    const api = rows(await list('alert=CON_ALERTA')).map(([code, , , status]) => ({ code, alert: status }));
    expect(api).toEqual(view);
  });
});

describe('Existencias por almacén (groupBy=warehouse)', () => {
  it('una fila por producto y almacén con existencia; el resumen cuenta productos, no filas', async () => {
    const res = await list('groupBy=warehouse');
    expect(rows(res)).toEqual([
      ['ZSTH-0001', 'PRIN', '25.000', 'SOBRE_MAXIMO'],
      ['ZSTK-0001', 'COMB', '30.000', 'NORMAL'],
      ['ZSTK-0001', 'PRIN', '20.500', 'NORMAL'],
      ['ZSTK-0002', 'COMB', '40.000', 'BAJO_MINIMO'],
    ]);
    expect(res.body.data[0].warehouses).toBeNull();
    expect(res.body.meta.summary).toEqual({ total: 3, normal: 1, bajoMinimo: 1, sobreMaximo: 1 });
    expect(rows(await list(`groupBy=warehouse&warehouseId=${ids.prin}`)).map((r) => r[0])).toEqual(['ZSTH-0001', 'ZSTK-0001']);
  });
});

describe('Validaciones', () => {
  it('lo consulta cualquier rol (USUARIO); sin sesión → 401', async () => {
    expect((await list('')).status).toBe(200);
    expect((await api.get('/api/stock')).status).toBe(401);
  });

  it('alert o groupBy desconocido → 400; almacén o categoría inexistente → 404', async () => {
    const badAlert = await list('alert=ROJO');
    expect(badAlert.status).toBe(400);
    expect(badAlert.body.error.details).toEqual([expect.objectContaining({ path: 'alert' })]);
    expect((await list('groupBy=lote')).status).toBe(400);
    expect((await list('warehouseId=99999999')).status).toBe(404);
    expect((await api.get('/api/stock?categoryId=99999999', { token })).status).toBe(404);
  });
});
