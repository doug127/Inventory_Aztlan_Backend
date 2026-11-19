// Integración de categorías de activos (HU-301) con la app real sobre inventory_test. Usa el árbol
// sembrado (VEHICULOS › … › TRACTOR, CAMPO › LOTE_1 con TB-100 y TB-101) y crea el suyo con nombres
// 'test.*' y códigos 'ZT_*'. Cubre los criterios del Módulo 5: LOTE_1 con tablones no admite
// subcategorías (CATEGORY_HAS_ASSETS) y VEHICULOS, con hijas, no admite activos (CATEGORY_NOT_LEAF).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { QueryTypes } from 'sequelize';
import app from '#src/app.js';
import { sequelize } from '#src/config/database.js';
import { AssetCategory } from '#src/database/models/index.model.js';
import { withTransaction } from '#src/shared/db/transaction.js';
import { mapDatabaseError } from '#src/shared/errors/mapDatabaseError.js';
import { assertLeafCategoryAvailable } from '#src/modules/asset/asset_category/asset_category.service.js';
import { startServer } from '../../helpers/http.js';
import { assertTestDatabase, createTestUser, deleteTestUsers } from '../../helpers/db.js';

let api;
let admin;
let almacenista;
let assetSeq = 0;

const BASE = '/api/asset-categories';
const tokenOf = async (user) =>
  (await api.post('/api/auth/login', { body: { username: user.username, password: user.password } })).body.data.accessToken;

const create = (body, token = admin) => api.post(BASE, { token, body });
const patch = (id, body, token = admin) => api.patch(`${BASE}/${id}`, { token, body });
const idOf = async (code) => (await AssetCategory.findOne({ where: { code } })).id;

/** Un activo de prueba en la categoría indicada (el módulo de activos llega en HU-302). */
const insertAsset = async (categoryId, { transaction, isActive = true } = {}) => {
  assetSeq += 1;
  await sequelize.query(
    `INSERT INTO assets (code, name, asset_category_id, is_active) VALUES (:code, :name, :categoryId, :isActive)`,
    { replacements: { code: `ZT-${String(assetSeq).padStart(3, '0')}`, name: `test.activo ${assetSeq}`, categoryId, isActive }, transaction }
  );
};

/** Borra los activos y las categorías de prueba de las hojas hacia la raíz (las FK son RESTRICT). */
const cleanup = async () => {
  await sequelize.query("DELETE FROM assets WHERE name LIKE 'test.%'");
  for (let deleted = 1; deleted > 0; ) {
    const [, result] = await sequelize.query(
      `DELETE FROM asset_categories c WHERE c.name LIKE 'test.%'
         AND NOT EXISTS (SELECT 1 FROM asset_categories h WHERE h.parent_id = c.id)`
    );
    deleted = result.rowCount;
  }
};

const dbError = (promise) => promise.then(() => null, (error) => mapDatabaseError(error));

beforeAll(async () => {
  assertTestDatabase();
  await deleteTestUsers();
  await cleanup();
  api = await startServer(app);
  admin = await tokenOf(await createTestUser({ name: 'ac.admin', roleCode: 'ADMIN' }));
  almacenista = await tokenOf(await createTestUser({ name: 'ac.alm', roleCode: 'ALMACENISTA' }));
});

afterAll(async () => {
  await api?.close();
  await cleanup();
  await deleteTestUsers();
  await sequelize.close();
});

describe('Consultas (todos los roles)', () => {
  it('GET /tree: árbol sembrado con iconos de raíz heredados y activos por rama', async () => {
    const res = await api.get(`${BASE}/tree`, { token: almacenista });
    expect(res.status).toBe(200);
    const vehiculos = res.body.data.find((n) => n.code === 'VEHICULOS');
    expect(vehiculos).toMatchObject({ depth: 0, icon: 'tractor', displayIcon: 'tractor', isLeaf: false, parent: null });
    expect(vehiculos.children.map((c) => c.code).sort()).toEqual(['LINEA_AMARILLA', 'MAQUINARIA_AGRICOLA', 'TRANSPORTE']);
    // 2 tractores + cosechadora + retro + cargador + camión + camioneta.
    expect(vehiculos.assetsInSubtree).toBe(7);
    const tractor = vehiculos.children.find((c) => c.code === 'MAQUINARIA_AGRICOLA').children.find((c) => c.code === 'TRACTOR');
    expect(tractor).toMatchObject({ icon: null, displayIcon: 'tractor', isLeaf: true, acceptsChildren: false, assetsInSubtree: 2 });
  });

  it('GET / con leaf=true solo lista las categorías que reciben activos; GET /:id trae la ruta', async () => {
    const leaves = await api.get(`${BASE}?leaf=true&limit=100`, { token: almacenista });
    const codes = leaves.body.data.map((c) => c.code);
    expect(codes).toEqual(expect.arrayContaining(['TRACTOR', 'LOTE_1', 'PERSONAL']));
    expect(codes).not.toContain('VEHICULOS');
    expect(leaves.body.meta.filters).toEqual({ leaf: true });

    const detail = await api.get(`${BASE}/${await idOf('TRACTOR')}`, { token: almacenista });
    expect(detail.body.data.path.map((c) => c.code)).toEqual(['VEHICULOS', 'MAQUINARIA_AGRICOLA']);
    expect(detail.body.data.displayIcon).toBe('tractor');
  });

  it('ALMACENISTA no crea, edita ni desactiva → 403', async () => {
    expect((await create({ code: 'ZT_NO', name: 'test.no' }, almacenista)).status).toBe(403);
    expect((await patch(await idOf('TRACTOR'), { name: 'X' }, almacenista)).status).toBe(403);
    expect((await api.post(`${BASE}/${await idOf('TRACTOR')}/deactivate`, { token: almacenista })).status).toBe(403);
  });
});

describe('Alta, iconos y reglas del árbol (ADMIN)', () => {
  let rootId;
  let childId;

  it('crea una raíz con icono y una subcategoría que hereda el icono', async () => {
    const root = await create({ code: 'zt_ganado', name: 'test.Ganado', icon: 'beef' });
    expect(root.status).toBe(201);
    expect(root.body.data).toMatchObject({ code: 'ZT_GANADO', icon: 'beef', displayIcon: 'beef', parent: null });
    rootId = root.body.data.id;

    const child = await create({ code: 'ZT_BOVINO', name: 'test.Bovino', parentId: rootId });
    expect(child.status).toBe(201);
    expect(child.body.data).toMatchObject({ icon: null, displayIcon: 'beef', parent: { code: 'ZT_GANADO' } });
    childId = child.body.data.id;
  });

  it('icono en una subcategoría → 400 en icon; icono fuera del catálogo → 400', async () => {
    const sub = await create({ code: 'ZT_OVINO', name: 'test.Ovino', parentId: rootId, icon: 'beef' });
    expect(sub.status).toBe(400);
    expect(sub.body.error.details).toEqual([expect.objectContaining({ path: 'icon' })]);

    const unknown = await create({ code: 'ZT_RARO', name: 'test.Raro', icon: 'no-existe' });
    expect(unknown.status).toBe(400);
    expect(unknown.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('código fuera de formato → INVALID_CODE_FORMAT; nombre repetido en el mismo padre → DUPLICATE_CODE', async () => {
    const bad = await create({ code: 'LOTE 3', name: 'test.Lote 3' });
    expect(bad.body.error.code).toBe('INVALID_CODE_FORMAT');
    const dup = await create({ code: 'ZT_BOVINO2', name: 'TEST.bovino', parentId: rootId });
    expect(dup.status).toBe(409);
    expect(dup.body.error.details).toEqual([expect.objectContaining({ path: 'name' })]);
  });

  it('LOTE_1 con tablones no admite subcategorías → CATEGORY_HAS_ASSETS (Módulo 5)', async () => {
    const res = await create({ code: 'ZT_SECTOR', name: 'test.Sector', parentId: await idOf('LOTE_1') });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CATEGORY_HAS_ASSETS');
    expect(res.body.error.details).toEqual([expect.objectContaining({ path: 'parentId' })]);

    // Tampoco se puede mover una categoría existente bajo LOTE_1.
    const moved = await patch(childId, { parentId: await idOf('LOTE_1') });
    expect(moved.body.error.code).toBe('CATEGORY_HAS_ASSETS');
  });

  it('mover la raíz dentro de su propia hija → CATEGORY_CYCLE', async () => {
    const res = await patch(rootId, { parentId: childId });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CATEGORY_CYCLE');
  });

  it('al mover una raíz dentro de otra pierde su icono; al volverla raíz puede recibir uno', async () => {
    const moved = await patch(rootId, { parentId: await idOf('CAMPO') });
    expect(moved.status).toBe(200);
    expect(moved.body.data).toMatchObject({ icon: null, displayIcon: 'wheat', parent: { code: 'CAMPO' } });

    const back = await patch(rootId, { parentId: null, icon: 'paw-print' });
    expect(back.body.data).toMatchObject({ icon: 'paw-print', displayIcon: 'paw-print', parent: null });
  });

  it('no se desactiva con hijas activas ni con activos activos; sin ellos, sí', async () => {
    const withChild = await api.post(`${BASE}/${rootId}/deactivate`, { token: admin });
    expect(withChild.body.error).toMatchObject({ code: 'HAS_DEPENDENCIES', details: { activeChildren: 1 } });

    await insertAsset(childId);
    const withAsset = await api.post(`${BASE}/${childId}/deactivate`, { token: admin });
    expect(withAsset.body.error).toMatchObject({ code: 'HAS_DEPENDENCIES', details: { activeAssets: 1 } });

    await sequelize.query("UPDATE assets SET is_active = false WHERE name LIKE 'test.%'");
    expect((await api.post(`${BASE}/${childId}/deactivate`, { token: admin })).body.data.isActive).toBe(false);
    expect((await api.post(`${BASE}/${rootId}/deactivate`, { token: admin })).body.data.isActive).toBe(false);
    // La hija no se reactiva antes que su padre.
    expect((await api.post(`${BASE}/${childId}/activate`, { token: admin })).body.error.code).toBe('INACTIVE_RESOURCE');
  });
});

describe('Respaldo en la base de datos (migración 20261118000001)', () => {
  it('un activo en una categoría con hijas lo rechaza el trigger → CATEGORY_NOT_LEAF', async () => {
    const error = await dbError(insertAsset(await idOf('VEHICULOS')));
    expect(error?.code).toBe('CATEGORY_NOT_LEAF');
  });

  it('una subcategoría bajo una categoría con activos la rechaza el trigger → CATEGORY_HAS_ASSETS', async () => {
    const error = await dbError(
      sequelize.query("INSERT INTO asset_categories (code, name, parent_id) VALUES ('ZT_DIRECTO', 'test.directo', :parentId)", {
        replacements: { parentId: await idOf('LOTE_1') },
      })
    );
    expect(error?.code).toBe('CATEGORY_HAS_ASSETS');
  });

  it('una subcategoría con icono la rechaza el CHECK chk_asset_categories_icon_root', async () => {
    const error = await dbError(
      sequelize.query("INSERT INTO asset_categories (code, name, parent_id, icon) VALUES ('ZT_ICONO', 'test.icono', :parentId, 'tractor')", {
        replacements: { parentId: await idOf('VEHICULOS') },
      })
    );
    expect(error).toMatchObject({ code: 'VALIDATION_ERROR', details: { constraint: 'chk_asset_categories_icon_root' } });
  });
});

describe('Concurrencia', () => {
  it('una subcategoría y un activo que llegan a la vez a la misma hoja: solo uno se registra', async () => {
    const leaf = await create({ code: 'ZT_HOJA', name: 'test.Hoja', icon: 'tag' });
    const leafId = leaf.body.data.id;

    const [child, asset] = await Promise.allSettled([
      create({ code: 'ZT_HOJA_HIJA', name: 'test.Hoja hija', parentId: leafId }).then((res) => {
        if (res.status !== 201) throw Object.assign(new Error(res.body.error.code), { code: res.body.error.code });
        return res;
      }),
      withTransaction(async (transaction) => {
        await assertLeafCategoryAvailable(leafId, { transaction });
        await insertAsset(leafId, { transaction });
      }),
    ]);

    const outcomes = [child.status, asset.status].sort();
    expect(outcomes).toEqual(['fulfilled', 'rejected']);
    const rejected = child.status === 'rejected' ? child.reason : asset.reason;
    expect(['CATEGORY_HAS_ASSETS', 'CATEGORY_NOT_LEAF']).toContain(rejected.code);

    const [{ children, assets }] = await sequelize.query(
      `SELECT (SELECT count(*)::int FROM asset_categories WHERE parent_id = :id) AS children,
              (SELECT count(*)::int FROM assets WHERE asset_category_id = :id) AS assets`,
      { replacements: { id: leafId }, type: QueryTypes.SELECT }
    );
    expect(children + assets).toBe(1);
  });
});
