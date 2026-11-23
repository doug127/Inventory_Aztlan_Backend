// Integración de activos (HU-302) con la app real sobre inventory_test. Usa los activos sembrados
// (T-01 y T-02 en TRACTOR, TB-100/101 en LOTE_1, TB-200 en LOTE_2, PE-* en PERSONAL) y crea los
// suyos con nombres 'test.*' y prefijo ZA. Cubre el criterio del Módulo 5: VEHICULOS, con hijas,
// no admite activos (CATEGORY_NOT_LEAF).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { QueryTypes } from 'sequelize';
import app from '#src/app.js';
import { sequelize } from '#src/config/database.js';
import { withTransaction } from '#src/shared/db/transaction.js';
import { assertAssetAvailable } from '#src/modules/asset/asset.service.js';
import { startServer } from '../../helpers/http.js';
import { assertTestDatabase, createTestUser, deleteTestUsers } from '../../helpers/db.js';

let api;
let admin;
let almacenista;
let adminUser;
let documentSeq = 980000;
const ids = {};

const BASE = '/api/assets';
const NOTE = 'test.movimiento activos';
const tokenOf = async (user) =>
  (await api.post('/api/auth/login', { body: { username: user.username, password: user.password } })).body.data.accessToken;
const one = async (sql, replacements) => (await sequelize.query(sql, { replacements, type: QueryTypes.SELECT }))[0];
const idOf = async (table, code) => (await one(`SELECT id FROM ${table} WHERE code = :code`, { code })).id;

const create = (body, token = admin) => api.post(BASE, { token, body });
const patch = (id, body, token = admin) => api.patch(`${BASE}/${id}`, { token, body });

/** Un movimiento de una línea con el activo: préstamo (OUT PRESTAMO), devolución (IN DEVOLUCION) o consumo. */
const addMovement = async (assetId, { type = 'OUT', reason = 'CONSUMO', quantity = 1 } = {}) => {
  documentSeq += 1;
  const isOut = type === 'OUT';
  const header = await one(
    `INSERT INTO movement_headers (document_number, movement_type, reason, created_by_user_id, warehouse_from_id, warehouse_to_id, received_by, note)
     VALUES (:doc, :type, :reason, :userId, :from, :to, :receivedBy, :note) RETURNING id`,
    {
      doc: `${isOut ? 'RET' : 'ENT'}-${documentSeq}`,
      type,
      reason,
      userId: adminUser.id,
      from: isOut ? ids.warehouse : null,
      to: isOut ? null : ids.warehouse,
      receivedBy: reason === 'PRESTAMO' ? 'test.responsable' : null,
      note: NOTE,
    }
  );
  await sequelize.query('INSERT INTO movement_lines (movement_header_id, product_id, quantity, asset_id) VALUES (:headerId, :productId, :quantity, :assetId)', {
    replacements: { headerId: header.id, productId: ids.product, quantity, assetId },
  });
};

/** Los movimientos son inmutables: el trigger se apaga solo durante el borrado y solo en *_test. */
const cleanup = async () => {
  assertTestDatabase();
  await sequelize.transaction(async (transaction) => {
    const q = (sql) => sequelize.query(sql, { transaction });
    await q('ALTER TABLE movement_lines DISABLE TRIGGER trg_movements_immutable');
    await q('ALTER TABLE movement_headers DISABLE TRIGGER trg_movements_immutable');
    await q(`DELETE FROM movement_lines WHERE movement_header_id IN (SELECT id FROM movement_headers WHERE note = '${NOTE}')`);
    await q(`DELETE FROM movement_headers WHERE note = '${NOTE}'`);
    await q('ALTER TABLE movement_lines ENABLE TRIGGER trg_movements_immutable');
    await q('ALTER TABLE movement_headers ENABLE TRIGGER trg_movements_immutable');
  });
  await sequelize.query("DELETE FROM assets WHERE name LIKE 'test.%'");
  await sequelize.query("DELETE FROM asset_categories WHERE name LIKE 'test.%' AND parent_id IS NOT NULL");
  await sequelize.query("DELETE FROM asset_categories WHERE name LIKE 'test.%'");
};

beforeAll(async () => {
  assertTestDatabase();
  await cleanup();
  await deleteTestUsers();
  api = await startServer(app);
  adminUser = await createTestUser({ name: 'as.admin', roleCode: 'ADMIN' });
  admin = await tokenOf(adminUser);
  almacenista = await tokenOf(await createTestUser({ name: 'as.alm', roleCode: 'ALMACENISTA' }));
  ids.warehouse = await idOf('warehouses', 'COMB');
  ids.product = (await one('SELECT id FROM products ORDER BY id LIMIT 1')).id;
  ids.tractor = await idOf('asset_categories', 'TRACTOR');
  ids.camion = await idOf('asset_categories', 'CAMION');
  ids.vehiculos = await idOf('asset_categories', 'VEHICULOS');
  // Una raíz hoja de prueba, sin activos todavía.
  ids.zona = (
    await one("INSERT INTO asset_categories (code, name, icon) VALUES ('ZA_PRUEBA', 'test.Zona de prueba', 'tag') RETURNING id")
  ).id;
});

afterAll(async () => {
  await api?.close();
  await cleanup();
  await deleteTestUsers();
  await sequelize.close();
});

describe('Consultas (todos los roles)', () => {
  it('filtrar por VEHICULOS incluye los activos de todas sus subcategorías, con ruta e icono', async () => {
    const res = await api.get(`${BASE}?categoryId=${ids.vehiculos}&limit=100`, { token: almacenista });
    expect(res.status).toBe(200);
    expect(res.body.data.map((a) => a.code)).toEqual(['CA-01', 'CG-01', 'CO-01', 'CV-01', 'RE-01', 'T-01', 'T-02']);
    const t01 = res.body.data.find((a) => a.code === 'T-01');
    expect(t01.category).toMatchObject({ code: 'TRACTOR', displayIcon: 'tractor' });
    expect(t01.category.path.map((c) => c.code)).toEqual(['VEHICULOS', 'MAQUINARIA_AGRICOLA', 'TRACTOR']);
    expect(res.body.meta.filters).toEqual({ categoryId: ids.vehiculos });
  });

  it('búsqueda por código o nombre', async () => {
    const res = await api.get(`${BASE}?search=tabl`, { token: almacenista });
    expect(res.body.data.map((a) => a.code)).toEqual(['TB-100', 'TB-101', 'TB-200']);
  });

  it('ALMACENISTA no crea, edita, desactiva ni pide códigos → 403', async () => {
    expect((await create({ name: 'test.no', categoryId: ids.tractor }, almacenista)).status).toBe(403);
    expect((await patch(1, { name: 'test.no' }, almacenista)).status).toBe(403);
    expect((await api.get(`${BASE}/next-code?categoryId=${ids.tractor}`, { token: almacenista })).status).toBe(403);
  });
});

describe('Código sugerido', () => {
  it('TRACTOR sugiere T-03; LOTE_2 sigue la numeración de tablones de toda la finca (TB-201); PERSONAL no sugiere', async () => {
    const next = (code) => api.get(`${BASE}/next-code?categoryId=${code}`, { token: admin });
    expect((await next(ids.tractor)).body.data).toMatchObject({ prefix: 'T', code: 'T-03' });
    expect((await next(await idOf('asset_categories', 'LOTE_2'))).body.data).toMatchObject({ prefix: 'TB', code: 'TB-201' });
    expect((await next(await idOf('asset_categories', 'PERSONAL'))).body.data).toMatchObject({ prefix: 'PE', code: null });
    expect((await next(ids.zona)).body.data).toMatchObject({ prefix: null, code: null });
  });

  it('VEHICULOS tiene subcategorías → CATEGORY_NOT_LEAF (Módulo 5)', async () => {
    const res = await create({ code: 'ZA-99', name: 'test.Vehículo genérico', categoryId: ids.vehiculos });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CATEGORY_NOT_LEAF');
    expect(res.body.error.details).toEqual([expect.objectContaining({ path: 'categoryId' })]);
  });
});

describe('Alta y edición (ADMIN)', () => {
  let assetId;

  it('sin código en una categoría sin activos → VALIDATION_ERROR en code; con código se crea', async () => {
    const missing = await create({ name: 'test.Primero', categoryId: ids.zona });
    expect(missing.status).toBe(400);
    expect(missing.body.error.details).toEqual([expect.objectContaining({ path: 'code' })]);

    const res = await create({ code: 'za-01', name: 'test.Primero', categoryId: ids.zona });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ code: 'ZA-01', isActive: true, hasMovements: false, pendingLoans: 0 });
    expect(res.body.data.category).toMatchObject({ code: 'ZA_PRUEBA', displayIcon: 'tag' });
    assetId = res.body.data.id;
  });

  it('5 altas simultáneas sin código reciben correlativos distintos (ZA-02…ZA-06)', async () => {
    const results = await Promise.all([1, 2, 3, 4, 5].map((n) => create({ name: `test.Simultáneo ${n}`, categoryId: ids.zona })));
    expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201, 201]);
    expect(results.map((r) => r.body.data.code).sort()).toEqual(['ZA-02', 'ZA-03', 'ZA-04', 'ZA-05', 'ZA-06']);
  });

  it('formato inválido → INVALID_CODE_FORMAT; código repetido o nombre repetido en la categoría → DUPLICATE_CODE', async () => {
    expect((await create({ code: 'ZA01', name: 'test.Malo', categoryId: ids.zona })).body.error.code).toBe('INVALID_CODE_FORMAT');

    const code = await create({ code: 'T-01', name: 'test.Otro', categoryId: ids.zona });
    expect(code.status).toBe(409);
    expect(code.body.error.details).toEqual([expect.objectContaining({ path: 'code' })]);

    const name = await create({ code: 'ZA-50', name: 'TEST.primero', categoryId: ids.zona });
    expect(name.body.error.details).toEqual([expect.objectContaining({ path: 'name' })]);

    // El mismo nombre en otra categoría sí se permite.
    expect((await create({ code: 'ZA-51', name: 'test.Primero', categoryId: ids.camion })).status).toBe(201);
  });

  it('con movimientos: el código queda fijo (HAS_DEPENDENCIES); el nombre y la categoría se cambian', async () => {
    await addMovement(assetId);
    const detail = await api.get(`${BASE}/${assetId}`, { token: admin });
    expect(detail.body.data.hasMovements).toBe(true);

    const code = await patch(assetId, { code: 'ZA-90' });
    expect(code.status).toBe(409);
    expect(code.body.error).toMatchObject({ code: 'HAS_DEPENDENCIES', details: [expect.objectContaining({ path: 'code' })] });

    const moved = await patch(assetId, { name: 'test.Primero reclasificado', categoryId: ids.camion });
    expect(moved.status).toBe(200);
    expect(moved.body.data).toMatchObject({ code: 'ZA-01', name: 'test.Primero reclasificado', category: { code: 'CAMION' } });

    // A una categoría con hijas, no.
    expect((await patch(assetId, { categoryId: ids.vehiculos })).body.error.code).toBe('CATEGORY_NOT_LEAF');
  });
});

describe('Desactivar con préstamos pendientes (regla 4)', () => {
  it('no se desactiva con un préstamo sin devolver; tras la devolución, sí', async () => {
    const { id } = (await create({ code: 'ZA-70', name: 'test.Prestatario', categoryId: ids.zona })).body.data;
    await addMovement(id, { reason: 'PRESTAMO', quantity: 3 });
    await addMovement(id, { type: 'IN', reason: 'DEVOLUCION', quantity: 1 });

    const listed = await api.get(`${BASE}/${id}`, { token: admin });
    expect(listed.body.data.pendingLoans).toBe(1);

    const blocked = await api.post(`${BASE}/${id}/deactivate`, { token: admin });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('HAS_DEPENDENCIES');
    expect(blocked.body.error.details.pendingLoans).toEqual([expect.objectContaining({ pending: '2.000' })]);

    await addMovement(id, { type: 'IN', reason: 'DEVOLUCION', quantity: 2 });
    const res = await api.post(`${BASE}/${id}/deactivate`, { token: admin });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ isActive: false, pendingLoans: 0 });

    // Un activo inactivo no recibe movimientos nuevos (para HU-401).
    await expect(withTransaction((transaction) => assertAssetAvailable(id, { transaction }))).rejects.toMatchObject({ code: 'INACTIVE_RESOURCE' });
    expect((await api.post(`${BASE}/${id}/activate`, { token: admin })).body.data.isActive).toBe(true);
  });
});

describe('Agrupación por lote y orden natural', () => {
  // CAMPO › test.Lote 2 (ZG-9, ZG-10, ZG-100 inactivo) y test.Lote 10 (ZG-1000). En orden de texto
  // común "Lote 10" iría antes que "Lote 2" y "ZG-100" antes que "ZG-9".
  const lots = {};
  beforeAll(async () => {
    const campo = await idOf('asset_categories', 'CAMPO');
    for (const [key, code, name] of [['two', 'ZG_LOTE_2', 'test.Lote 2'], ['ten', 'ZG_LOTE_10', 'test.Lote 10']]) {
      lots[key] = (await one('INSERT INTO asset_categories (code, name, parent_id) VALUES (:code, :name, :campo) RETURNING id', { code, name, campo })).id;
    }
    for (const [code, lot, isActive] of [['ZG-100', 'two', false], ['ZG-10', 'two', true], ['ZG-9', 'two', true], ['ZG-1000', 'ten', true]]) {
      await sequelize.query('INSERT INTO assets (code, name, asset_category_id, is_active) VALUES (:code, :name, :categoryId, :isActive)', {
        replacements: { code, name: `test.Tablón ${code.slice(3)}`, categoryId: lots[lot], isActive },
      });
    }
  });

  it('GET /groups?categoryId=CAMPO: un grupo por lote en orden natural, con su cantidad y su rango de códigos', async () => {
    const res = await api.get(`${BASE}/groups?categoryId=${await idOf('asset_categories', 'CAMPO')}`, { token: almacenista });
    expect(res.status).toBe(200);
    expect(res.body.data.map((g) => g.category.name)).toEqual(['Lote 1', 'Lote 2', 'test.Lote 2', 'test.Lote 10']);
    expect(res.body.meta.pagination.totalItems).toBe(4);
    const two = res.body.data.find((g) => g.category.id === lots.two);
    expect(two).toMatchObject({ assets: 3, active: 2, firstCode: 'ZG-9', lastCode: 'ZG-100', category: { displayIcon: 'wheat' } });
    expect(two.category.path.map((p) => p.code)).toEqual(['CAMPO', 'ZG_LOTE_2']);
  });

  it('los filtros de la lista se aplican a los grupos: búsqueda y estado', async () => {
    const campo = await idOf('asset_categories', 'CAMPO');
    const found = await api.get(`${BASE}/groups?categoryId=${campo}&search=ZG-10`, { token: almacenista });
    expect(found.body.data.map((g) => [g.category.name, g.assets])).toEqual([['test.Lote 2', 2], ['test.Lote 10', 1]]);
    const inactive = await api.get(`${BASE}/groups?categoryId=${campo}&isActive=false`, { token: almacenista });
    expect(inactive.body.data.map((g) => [g.category.name, g.assets, g.firstCode])).toEqual([['test.Lote 2', 1, 'ZG-100']]);
  });

  it('al abrir el lote, sus tablones salen en orden natural; el árbol también ordena los lotes así', async () => {
    const res = await api.get(`${BASE}?categoryId=${lots.two}&sort=code`, { token: almacenista });
    expect(res.body.data.map((a) => a.code)).toEqual(['ZG-9', 'ZG-10', 'ZG-100']);
    const tree = await api.get('/api/asset-categories/tree', { token: almacenista });
    const campo = tree.body.data.find((n) => n.code === 'CAMPO');
    expect(campo.children.map((c) => c.name)).toEqual(['Lote 1', 'Lote 2', 'test.Lote 2', 'test.Lote 10']);
  });

  it('sin sesión → 401; limit fuera de rango → 400', async () => {
    expect((await api.get(`${BASE}/groups`)).status).toBe(401);
    const res = await api.get(`${BASE}/groups?limit=500`, { token: almacenista });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
