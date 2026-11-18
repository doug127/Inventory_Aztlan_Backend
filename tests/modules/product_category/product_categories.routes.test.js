// Integración de categorías de productos (HU-203) con la app real sobre inventory_test. Usa las
// categorías sembradas (INSU › FERT, REPU › FILT, LUBR…) y crea las suyas con nombres 'test.*' y
// códigos 'Z…'. Cubre el criterio del Módulo 4: un cambio de padre que crea un ciclo → CATEGORY_CYCLE.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { QueryTypes } from 'sequelize';
import app from '#src/app.js';
import { sequelize } from '#src/config/database.js';
import { ProductCategory } from '#src/database/models/index.model.js';
import { startServer } from '../../helpers/http.js';
import { assertTestDatabase, createTestUser, deleteTestUsers } from '../../helpers/db.js';

let api;
let admin;
let almacenista;
let productSeq = 9700;

const BASE = '/api/product-categories';
const tokenOf = async (user) =>
  (await api.post('/api/auth/login', { body: { username: user.username, password: user.password } })).body.data.accessToken;

const create = (body, token = admin) => api.post(BASE, { token, body });
const patch = (id, body, token = admin) => api.patch(`${BASE}/${id}`, { token, body });
const idOf = async (code) => (await ProductCategory.findOne({ where: { code } })).id;

/** Un producto de prueba en la categoría indicada. */
const createProductIn = async (categoryId, code, { isActive = true } = {}) => {
  const [{ unitId }] = await sequelize.query("SELECT id AS \"unitId\" FROM units WHERE code = 'UND'", { type: QueryTypes.SELECT });
  productSeq += 1;
  await sequelize.query(
    `INSERT INTO products (code, name, product_category_id, unit_id, is_active)
     VALUES (:code, 'test.producto categorías', :categoryId, :unitId, :isActive)`,
    { replacements: { code: `${code}-${productSeq}`, categoryId, unitId, isActive } }
  );
};

/** Borra las categorías de prueba de las hojas hacia la raíz (la FK de parent_id es RESTRICT). */
const cleanup = async () => {
  await sequelize.query("DELETE FROM products WHERE name LIKE 'test.%'");
  for (let deleted = 1; deleted > 0; ) {
    const [, result] = await sequelize.query(
      `DELETE FROM product_categories c WHERE c.name LIKE 'test.%'
         AND NOT EXISTS (SELECT 1 FROM product_categories h WHERE h.parent_id = c.id)`
    );
    deleted = result.rowCount;
  }
};

beforeAll(async () => {
  assertTestDatabase();
  await deleteTestUsers();
  await cleanup();
  api = await startServer(app);
  admin = await tokenOf(await createTestUser({ name: 'pc.admin', roleCode: 'ADMIN' }));
  almacenista = await tokenOf(await createTestUser({ name: 'pc.alm', roleCode: 'ALMACENISTA' }));
});

afterAll(async () => {
  await api?.close();
  await cleanup();
  await deleteTestUsers();
  await sequelize.close();
});

describe('Consultas (todos los roles)', () => {
  it('GET /tree devuelve el árbol sembrado con sus hijas', async () => {
    const res = await api.get(`${BASE}/tree`, { token: almacenista });
    expect(res.status).toBe(200);
    const insu = res.body.data.find((n) => n.code === 'INSU');
    expect(insu).toMatchObject({ depth: 0, isLeaf: false, parent: null });
    expect(insu.children.map((c) => c.code)).toEqual(expect.arrayContaining(['FERT', 'HERB', 'INSE']));
    expect(insu.children.every((c) => c.depth === 1 && c.parent.code === 'INSU')).toBe(true);
    expect(res.body.data.some((n) => n.code === 'FERT')).toBe(false);
  });

  it('GET / paginado con búsqueda y filtro de hijas directas', async () => {
    const children = await api.get(`${BASE}?parentId=${await idOf('REPU')}`, { token: almacenista });
    expect(children.body.data.map((c) => c.code).sort()).toEqual(['FILT', 'NEUM']);
    expect(children.body.meta.filters).toEqual({ parentId: await idOf('REPU') });

    const search = await api.get(`${BASE}?search=lubr`, { token: almacenista });
    expect(search.body.data[0]).toMatchObject({ code: 'LUBR', isLeaf: true });
    expect(search.body.meta.pagination).toMatchObject({ page: 1, totalItems: 1 });
  });

  it('GET /:id trae la ruta desde la raíz; inexistente → 404', async () => {
    const fert = await api.get(`${BASE}/${await idOf('FERT')}`, { token: almacenista });
    expect(fert.body.data).toMatchObject({ code: 'FERT', path: [{ code: 'INSU' }], children: [] });
    expect((await api.get(`${BASE}/99999999`, { token: almacenista })).status).toBe(404);
  });
});

describe('POST /api/product-categories', () => {
  it('crea una raíz y una subcategoría; el código se normaliza', async () => {
    const root = await create({ code: ' zraa ', name: 'test.Raíz A', description: '  Para pruebas  ' });
    expect(root.status).toBe(201);
    expect(root.body.data).toMatchObject({ code: 'ZRAA', parent: null, description: 'Para pruebas', isLeaf: true });

    const child = await create({ code: 'ZHAA', name: 'test.Hija A', parentId: root.body.data.id });
    expect(child.status).toBe(201);
    expect(child.body.data.parent).toMatchObject({ code: 'ZRAA' });
  });

  it('el nombre es único dentro del mismo padre, no en todo el árbol (regla 2)', async () => {
    const a = (await create({ code: 'ZRBA', name: 'test.Padre B1' })).body.data;
    const b = (await create({ code: 'ZRBB', name: 'test.Padre B2' })).body.data;
    expect((await create({ code: 'ZHBA', name: 'test.Repetida', parentId: a.id })).status).toBe(201);
    expect((await create({ code: 'ZHBB', name: 'test.Repetida', parentId: b.id })).status).toBe(201);

    const dup = await create({ code: 'ZHBC', name: 'TEST.REPETIDA', parentId: a.id });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toMatchObject({ code: 'DUPLICATE_CODE', details: [expect.objectContaining({ path: 'name' })] });
  });

  it('código inválido o repetido, padre inexistente → error del catálogo', async () => {
    expect((await create({ code: 'ZR1', name: 'test.Código' })).body.error.code).toBe('INVALID_CODE_FORMAT');
    expect((await create({ code: 'LUBR', name: 'test.Lubricantes 2' })).body.error.code).toBe('DUPLICATE_CODE');
    expect((await create({ code: 'ZRCC', name: 'test.Sin padre', parentId: 99999999 })).body.error.code).toBe('VALIDATION_ERROR');
  });

  it('ALMACENISTA consulta pero no crea → 403', async () => {
    expect((await create({ code: 'ZNOP', name: 'test.Sin permiso' }, almacenista)).body.error.code).toBe('FORBIDDEN_ROLE');
  });
});

describe('Mover (PATCH parentId) sin ciclos — regla 1', () => {
  it('mover una categoría dentro de su nieta → 409 CATEGORY_CYCLE', async () => {
    const top = (await create({ code: 'ZCTA', name: 'test.Ciclo raíz' })).body.data;
    const mid = (await create({ code: 'ZCTB', name: 'test.Ciclo hija', parentId: top.id })).body.data;
    const leaf = (await create({ code: 'ZCTC', name: 'test.Ciclo nieta', parentId: mid.id })).body.data;

    const cycle = await patch(top.id, { parentId: leaf.id });
    expect(cycle.status).toBe(409);
    expect(cycle.body.error.code).toBe('CATEGORY_CYCLE');
    expect((await patch(mid.id, { parentId: mid.id })).body.error.code).toBe('CATEGORY_CYCLE');

    // Mover la hija (con su nieta) a la raíz sí se permite, y el árbol lo refleja.
    const moved = await patch(mid.id, { parentId: null });
    expect(moved.status).toBe(200);
    const tree = (await api.get(`${BASE}/tree`, { token: almacenista })).body.data;
    expect(tree.find((n) => n.code === 'ZCTB').children.map((c) => c.code)).toEqual(['ZCTC']);
  });

  it('dos movimientos simultáneos cruzados no dejan un ciclo', async () => {
    const a = (await create({ code: 'ZXAA', name: 'test.Cruce A' })).body.data;
    const b = (await create({ code: 'ZXBB', name: 'test.Cruce B' })).body.data;
    const results = await Promise.all([patch(a.id, { parentId: b.id }), patch(b.id, { parentId: a.id })]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(results.find((r) => r.status === 409).body.error.code).toBe('CATEGORY_CYCLE');
  });

  it('con productos: se corrige el nombre, pero no el código → HAS_DEPENDENCIES', async () => {
    const cat = (await create({ code: 'ZPRA', name: 'test.Con productos' })).body.data;
    await createProductIn(cat.id, 'ZPRA');
    expect((await patch(cat.id, { name: 'test.Con productos (renombrada)' })).status).toBe(200);
    const code = await patch(cat.id, { code: 'ZPRB' });
    expect(code.status).toBe(409);
    expect(code.body.error).toMatchObject({ code: 'HAS_DEPENDENCIES', details: [expect.objectContaining({ path: 'code' })] });
  });
});

describe('Desactivar y activar — regla 3', () => {
  it('con hijas activas no se desactiva; después de desactivar la hija sí; la hija no se reactiva sola', async () => {
    const parent = (await create({ code: 'ZDPA', name: 'test.Desact padre' })).body.data;
    const child = (await create({ code: 'ZDHA', name: 'test.Desact hija', parentId: parent.id })).body.data;

    const blocked = await api.post(`${BASE}/${parent.id}/deactivate`, { token: admin });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toMatchObject({ code: 'HAS_DEPENDENCIES', details: { activeChildren: 1 } });

    expect((await api.post(`${BASE}/${child.id}/deactivate`, { token: admin })).status).toBe(200);
    expect((await api.post(`${BASE}/${parent.id}/deactivate`, { token: admin })).body.data.isActive).toBe(false);

    const reactivate = await api.post(`${BASE}/${child.id}/activate`, { token: admin });
    expect(reactivate.body.error.code).toBe('INACTIVE_RESOURCE');
    expect((await create({ code: 'ZDHB', name: 'test.Bajo inactiva', parentId: parent.id })).body.error.code).toBe('INACTIVE_RESOURCE');

    const activeTree = (await api.get(`${BASE}/tree?isActive=true`, { token: almacenista })).body.data;
    expect(activeTree.some((n) => n.code === 'ZDPA')).toBe(false);
  });

  it('con productos activos → HAS_DEPENDENCIES; con el producto inactivo sí se desactiva', async () => {
    const cat = (await create({ code: 'ZDPR', name: 'test.Desact productos' })).body.data;
    await createProductIn(cat.id, 'ZDPR');

    const blocked = await api.post(`${BASE}/${cat.id}/deactivate`, { token: admin });
    expect(blocked.body.error).toMatchObject({ code: 'HAS_DEPENDENCIES', details: { activeProducts: 1 } });

    await sequelize.query('UPDATE products SET is_active = false WHERE product_category_id = :id', { replacements: { id: cat.id } });
    expect((await api.post(`${BASE}/${cat.id}/deactivate`, { token: admin })).status).toBe(200);
  });

  it('ALMACENISTA no edita, no mueve ni desactiva', async () => {
    const id = await idOf('FERT');
    expect((await patch(id, { parentId: null }, almacenista)).status).toBe(403);
    expect((await api.post(`${BASE}/${id}/deactivate`, { token: almacenista })).status).toBe(403);
  });
});
