// Integración de almacenes (HU-201) con la app real sobre inventory_test. Los almacenes de prueba
// usan códigos que empiezan con 'Z' y nombres 'test.*'; el stock se inserta directo en la tabla.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Op, QueryTypes } from 'sequelize';
import app from '#src/app.js';
import { sequelize } from '#src/config/database.js';
import { Warehouse } from '#src/database/models/index.model.js';
import { assertWarehouseAvailable } from '#src/modules/warehouse/warehouse.service.js';
import { startServer } from '../../helpers/http.js';
import { assertTestDatabase, createTestUser, deleteTestUsers } from '../../helpers/db.js';

let api;
let admin;
let almacenista;
let productId;

const tokenOf = async (user) =>
  (await api.post('/api/auth/login', { body: { username: user.username, password: user.password } })).body.data.accessToken;

const create = (body, token = admin) => api.post('/api/warehouses', { token, body });

/** Un producto de prueba para poner existencias. Usa la primera categoría y unidad sembradas. */
const createTestProduct = async () => {
  const [{ categoryId, categoryCode }] = await sequelize.query(
    'SELECT id AS "categoryId", code AS "categoryCode" FROM product_categories ORDER BY id LIMIT 1',
    { type: QueryTypes.SELECT }
  );
  const [{ unitId }] = await sequelize.query('SELECT id AS "unitId" FROM units ORDER BY id LIMIT 1', { type: QueryTypes.SELECT });
  const [{ id }] = await sequelize.query(
    `INSERT INTO products (code, name, product_category_id, unit_id) VALUES (:code, 'test.producto almacenes', :categoryId, :unitId)
     RETURNING id`,
    { replacements: { code: `${categoryCode}-9901`, categoryId, unitId }, type: QueryTypes.SELECT }
  );
  return id;
};

const setStock = (warehouseId, quantity) =>
  sequelize.query(
    `INSERT INTO stock (product_id, warehouse_id, quantity) VALUES (:productId, :warehouseId, :quantity)
     ON CONFLICT (product_id, warehouse_id) DO UPDATE SET quantity = EXCLUDED.quantity`,
    { replacements: { productId, warehouseId, quantity } }
  );

const cleanup = async () => {
  const ids = (await Warehouse.findAll({ where: { name: { [Op.startsWith]: 'test.' } }, attributes: ['id'] })).map((w) => w.id);
  if (ids.length) await sequelize.query('DELETE FROM stock WHERE warehouse_id IN (:ids)', { replacements: { ids } });
  await sequelize.query("DELETE FROM stock WHERE product_id IN (SELECT id FROM products WHERE name LIKE 'test.%')");
  await sequelize.query("DELETE FROM products WHERE name LIKE 'test.%'");
  await Warehouse.destroy({ where: { name: { [Op.startsWith]: 'test.' } } });
};

beforeAll(async () => {
  assertTestDatabase();
  await deleteTestUsers();
  await cleanup();
  api = await startServer(app);
  admin = await tokenOf(await createTestUser({ name: 'wh.admin', roleCode: 'ADMIN' }));
  almacenista = await tokenOf(await createTestUser({ name: 'wh.alm', roleCode: 'ALMACENISTA' }));
  productId = await createTestProduct();
});

afterAll(async () => {
  await api?.close();
  await cleanup();
  await deleteTestUsers();
  await sequelize.close();
});

describe('POST /api/warehouses', () => {
  it('un ADMIN crea un almacén; el código se normaliza a mayúsculas', async () => {
    const res = await create({ code: ' zc01 ', name: '  test.Almacén   Central ' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      code: 'ZC01',
      name: 'test.Almacén Central',
      isActive: true,
      stock: { productsWithStock: 0, isEmpty: true },
    });
  });

  it('código con formato inválido → 400 INVALID_CODE_FORMAT (regla 1)', async () => {
    for (const code of ['ZC1', 'ZC001', 'Z-01']) {
      const res = await create({ code, name: `test.formato ${code}` });
      expect(res.status, code).toBe(400);
      expect(res.body.error.code).toBe('INVALID_CODE_FORMAT');
    }
  });

  it('código o nombre repetido (sin distinguir mayúsculas) → 409 DUPLICATE_CODE', async () => {
    await create({ code: 'ZD01', name: 'test.Duplicado' });
    const res = await create({ code: 'zd01', name: 'TEST.DUPLICADO' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_CODE');
    expect(res.body.error.details.map((d) => d.path).sort()).toEqual(['code', 'name']);
  });

  it('ALMACENISTA → 403 FORBIDDEN_ROLE; campos faltantes → 400', async () => {
    const denied = await create({ code: 'ZX01', name: 'test.Sin permiso' }, almacenista);
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('FORBIDDEN_ROLE');
    expect((await create({ code: 'ZX02' })).status).toBe(400);
  });
});

describe('GET /api/warehouses', () => {
  it('todos los roles consultan, con búsqueda, filtro de estado y paginación', async () => {
    await create({ code: 'ZL01', name: 'test.Lista Uno' });
    const two = await create({ code: 'ZL02', name: 'test.Lista Dos' });
    await api.post(`/api/warehouses/${two.body.data.id}/deactivate`, { token: admin });

    const res = await api.get('/api/warehouses?search=test.lista&limit=1&sort=code', { token: almacenista });
    expect(res.status).toBe(200);
    expect(res.body.data.map((w) => w.code)).toEqual(['ZL01']);
    expect(res.body.meta.pagination).toMatchObject({ totalItems: 2, totalPages: 2 });

    const inactive = await api.get('/api/warehouses?search=test.lista&isActive=false', { token: almacenista });
    expect(inactive.body.data.map((w) => w.code)).toEqual(['ZL02']);
    expect(inactive.body.meta.filters).toEqual({ isActive: false });
  });

  it('GET /:id trae el resumen de existencias; inexistente → 404', async () => {
    const { body } = await create({ code: 'ZG01', name: 'test.Ficha' });
    await setStock(body.data.id, 25.5);
    const res = await api.get(`/api/warehouses/${body.data.id}`, { token: almacenista });
    expect(res.body.data.stock).toEqual({ productsWithStock: 1, isEmpty: false });
    expect((await api.get('/api/warehouses/99999999', { token: almacenista })).status).toBe(404);
  });
});

describe('PATCH /api/warehouses/:id', () => {
  it('edita código y nombre; ALMACENISTA no puede', async () => {
    const { body } = await create({ code: 'ZE01', name: 'test.Editar' });
    const res = await api.patch(`/api/warehouses/${body.data.id}`, { token: admin, body: { code: 'ze02', name: 'test.Editado' } });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ code: 'ZE02', name: 'test.Editado' });
    expect((await api.patch(`/api/warehouses/${body.data.id}`, { token: almacenista, body: { name: 'test.X' } })).status).toBe(403);
  });

  it('cuerpo vacío → 400; código de otro almacén → 409', async () => {
    const { body } = await create({ code: 'ZE03', name: 'test.Editar Dos' });
    await create({ code: 'ZE04', name: 'test.Editar Tres' });
    expect((await api.patch(`/api/warehouses/${body.data.id}`, { token: admin, body: {} })).status).toBe(400);
    const res = await api.patch(`/api/warehouses/${body.data.id}`, { token: admin, body: { code: 'ZE04' } });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_CODE');
  });
});

describe('desactivar y activar (regla 2)', () => {
  it('con stock → 409 HAS_STOCK (criterio del Módulo 4); con stock 0 se desactiva', async () => {
    const { body } = await create({ code: 'ZS01', name: 'test.Con Stock' });
    const id = body.data.id;
    await setStock(id, 300);

    const blocked = await api.post(`/api/warehouses/${id}/deactivate`, { token: admin });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toMatchObject({ code: 'HAS_STOCK', details: { warehouseCode: 'ZS01', productsWithStock: 1 } });
    expect((await Warehouse.findByPk(id)).isActive).toBe(true);

    // Una fila de stock en 0 no cuenta como existencia.
    await setStock(id, 0);
    const ok = await api.post(`/api/warehouses/${id}/deactivate`, { token: admin });
    expect(ok.status).toBe(200);
    expect(ok.body.data.isActive).toBe(false);

    const again = await api.post(`/api/warehouses/${id}/activate`, { token: admin });
    expect(again.body.data.isActive).toBe(true);
  });

  it('ALMACENISTA no desactiva', async () => {
    const { body } = await create({ code: 'ZS02', name: 'test.Sin Permiso Desactivar' });
    expect((await api.post(`/api/warehouses/${body.data.id}/deactivate`, { token: almacenista })).status).toBe(403);
  });

  it('un almacén inactivo no puede usarse en movimientos nuevos (regla 3)', async () => {
    const { body } = await create({ code: 'ZS03', name: 'test.Inactivo Movimientos' });
    await api.post(`/api/warehouses/${body.data.id}/deactivate`, { token: admin });
    await expect(sequelize.transaction((transaction) => assertWarehouseAvailable(body.data.id, { transaction }))).rejects.toMatchObject({
      code: 'INACTIVE_RESOURCE',
    });
  });
});
