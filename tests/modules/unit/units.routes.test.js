// Integración de unidades (HU-202) con la app real sobre inventory_test. Usa las unidades
// sembradas (L, ML, GAL, TAMB, KG…) y crea las suyas con nombres 'test.*' y códigos 'Z…'.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Op, QueryTypes } from 'sequelize';
import app from '#src/app.js';
import { sequelize } from '#src/config/database.js';
import { Unit } from '#src/database/models/index.model.js';
import { startServer } from '../../helpers/http.js';
import { assertTestDatabase, createTestUser, deleteTestUsers } from '../../helpers/db.js';

let api;
let admin;
let almacenista;
let litroId;
let productSeq = 9800;

const tokenOf = async (user) =>
  (await api.post('/api/auth/login', { body: { username: user.username, password: user.password } })).body.data.accessToken;

const create = (body, token = admin) => api.post('/api/units', { token, body });

/** Un producto de prueba que usa la unidad indicada. */
const createProductWithUnit = async (unitId, { isActive = true } = {}) => {
  const [{ categoryId, categoryCode }] = await sequelize.query(
    'SELECT id AS "categoryId", code AS "categoryCode" FROM product_categories ORDER BY id LIMIT 1',
    { type: QueryTypes.SELECT }
  );
  productSeq += 1;
  await sequelize.query(
    `INSERT INTO products (code, name, product_category_id, unit_id, is_active)
     VALUES (:code, 'test.producto unidades', :categoryId, :unitId, :isActive)`,
    { replacements: { code: `${categoryCode}-${productSeq}`, categoryId, unitId, isActive } }
  );
};

const cleanup = async () => {
  await sequelize.query("DELETE FROM products WHERE name LIKE 'test.%'");
  // Primero las derivadas (la FK de base_unit_id es RESTRICT).
  await Unit.destroy({ where: { name: { [Op.startsWith]: 'test.' }, baseUnitId: { [Op.ne]: null } } });
  await Unit.destroy({ where: { name: { [Op.startsWith]: 'test.' } } });
};

beforeAll(async () => {
  assertTestDatabase();
  await deleteTestUsers();
  await cleanup();
  api = await startServer(app);
  admin = await tokenOf(await createTestUser({ name: 'un.admin', roleCode: 'ADMIN' }));
  almacenista = await tokenOf(await createTestUser({ name: 'un.alm', roleCode: 'ALMACENISTA' }));
  litroId = (await Unit.findOne({ where: { code: 'L' } })).id;
});

afterAll(async () => {
  await api?.close();
  await cleanup();
  await deleteTestUsers();
  await sequelize.close();
});

describe('GET /api/units', () => {
  it('lista las unidades sembradas con su equivalencia; filtra por familia y tipo', async () => {
    const family = await api.get(`/api/units?baseUnitId=${litroId}&sort=code`, { token: almacenista });
    expect(family.status).toBe(200);
    const byCode = Object.fromEntries(family.body.data.map((u) => [u.code, u]));
    expect(Object.keys(byCode)).toEqual(expect.arrayContaining(['L', 'ML', 'GAL', 'TAMB']));
    expect(byCode.L).toMatchObject({ isBase: true, conversionFactor: '1', equivalence: null, baseUnit: null });
    expect(byCode.TAMB).toMatchObject({ isBase: false, conversionFactor: '208', equivalence: '1 TAMB = 208 L' });
    expect(byCode.GAL.conversionFactor).toBe('3.785411');
    expect(byCode.L.usage.activeDerivedUnits).toBeGreaterThanOrEqual(3);

    const bases = await api.get('/api/units?kind=base&limit=100', { token: almacenista });
    expect(bases.body.data.every((u) => u.isBase)).toBe(true);
    expect(bases.body.meta.filters).toEqual({ kind: 'base' });
  });

  it('GET /:id e inexistente → 404', async () => {
    expect((await api.get(`/api/units/${litroId}`, { token: almacenista })).body.data.code).toBe('L');
    expect((await api.get('/api/units/99999999', { token: almacenista })).status).toBe(404);
  });
});

describe('GET /api/units/convert', () => {
  it('convierte dentro de la misma familia con 3 decimales', async () => {
    const res = await api.get('/api/units/convert?from=tamb&to=L&quantity=2', { token: almacenista });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ from: { code: 'TAMB', quantity: '2' }, to: { code: 'L', quantity: '416.000' }, text: '2 TAMB = 416 L' });

    const small = await api.get('/api/units/convert?from=ML&to=GAL&quantity=500', { token: almacenista });
    expect(small.body.data.to.quantity).toBe('0.132');
  });

  it('familias distintas → 400; unidad inexistente → 404; cantidad inválida → 400', async () => {
    const mixed = await api.get('/api/units/convert?from=L&to=KG&quantity=1', { token: almacenista });
    expect(mixed.status).toBe(400);
    expect(mixed.body.error.message).toMatch(/magnitudes distintas/);
    expect((await api.get('/api/units/convert?from=ZZZ&to=L&quantity=1', { token: almacenista })).status).toBe(404);
    expect((await api.get('/api/units/convert?from=L&to=ML&quantity=-3', { token: almacenista })).status).toBe(400);
  });
});

describe('POST /api/units', () => {
  it('crea una base y una derivada; el código se normaliza', async () => {
    const base = await create({ code: ' zbas ', name: 'test.Base' });
    expect(base.status).toBe(201);
    expect(base.body.data).toMatchObject({ code: 'ZBAS', isBase: true, conversionFactor: '1' });

    const derived = await create({ code: 'ZDER', name: 'test.Derivada', baseUnitId: base.body.data.id, conversionFactor: 12.5 });
    expect(derived.status).toBe(201);
    expect(derived.body.data).toMatchObject({ conversionFactor: '12.5', equivalence: '1 ZDER = 12.5 ZBAS', baseUnit: { code: 'ZBAS' } });
  });

  it('base derivada, factor faltante, código inválido o repetido → error del catálogo', async () => {
    const gal = await Unit.findOne({ where: { code: 'GAL' } });
    expect((await create({ code: 'ZCAD', name: 'test.Cadena', baseUnitId: gal.id, conversionFactor: 2 })).body.error.code).toBe(
      'VALIDATION_ERROR'
    );
    expect((await create({ code: 'ZSIN', name: 'test.Sin factor', baseUnitId: litroId })).body.error.code).toBe('VALIDATION_ERROR');
    expect((await create({ code: 'Z1', name: 'test.Numero' })).body.error.code).toBe('INVALID_CODE_FORMAT');
    expect((await create({ code: 'L', name: 'test.Litro repetido' })).body.error.code).toBe('DUPLICATE_CODE');
    expect((await create({ code: 'ZFAC', name: 'test.Factor raro', baseUnitId: litroId, conversionFactor: '1.1234567' })).status).toBe(400);
  });

  it('ALMACENISTA no crea → 403', async () => {
    expect((await create({ code: 'ZNOP', name: 'test.Sin permiso' }, almacenista)).body.error.code).toBe('FORBIDDEN_ROLE');
  });
});

describe('PATCH y desactivar (regla 3)', () => {
  it('con productos: se corrige el factor, pero no el código → HAS_DEPENDENCIES', async () => {
    const { body } = await create({ code: 'ZUSA', name: 'test.Usada', baseUnitId: litroId, conversionFactor: 20 });
    await createProductWithUnit(body.data.id);

    const factor = await api.patch(`/api/units/${body.data.id}`, { token: admin, body: { conversionFactor: '19.5' } });
    expect(factor.status).toBe(200);
    expect(factor.body.data.equivalence).toBe('1 ZUSA = 19.5 L');

    const code = await api.patch(`/api/units/${body.data.id}`, { token: admin, body: { code: 'ZOTR' } });
    expect(code.status).toBe(409);
    expect(code.body.error).toMatchObject({ code: 'HAS_DEPENDENCIES', details: [expect.objectContaining({ path: 'code' })] });
  });

  it('usada por un producto activo → 409 HAS_DEPENDENCIES; con el producto inactivo sí se desactiva', async () => {
    const { body } = await create({ code: 'ZACT', name: 'test.Con producto', baseUnitId: litroId, conversionFactor: 5 });
    const id = body.data.id;
    await createProductWithUnit(id);

    const blocked = await api.post(`/api/units/${id}/deactivate`, { token: admin });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toMatchObject({ code: 'HAS_DEPENDENCIES', details: { activeProducts: 1 } });

    await sequelize.query('UPDATE products SET is_active = false WHERE unit_id = :id', { replacements: { id } });
    const ok = await api.post(`/api/units/${id}/deactivate`, { token: admin });
    expect(ok.status).toBe(200);
    expect(ok.body.data.isActive).toBe(false);
  });

  it('una base con derivadas activas no se desactiva; la derivada no se reactiva con la base inactiva', async () => {
    const base = (await create({ code: 'ZBAD', name: 'test.Base con hijas' })).body.data;
    const child = (await create({ code: 'ZHIJ', name: 'test.Hija', baseUnitId: base.id, conversionFactor: 3 })).body.data;

    expect((await api.post(`/api/units/${base.id}/deactivate`, { token: admin })).body.error.code).toBe('HAS_DEPENDENCIES');

    await api.post(`/api/units/${child.id}/deactivate`, { token: admin });
    expect((await api.post(`/api/units/${base.id}/deactivate`, { token: admin })).status).toBe(200);

    const reactivate = await api.post(`/api/units/${child.id}/activate`, { token: admin });
    expect(reactivate.status).toBe(409);
    expect(reactivate.body.error.code).toBe('INACTIVE_RESOURCE');
  });

  it('ALMACENISTA no edita ni desactiva', async () => {
    expect((await api.patch(`/api/units/${litroId}`, { token: almacenista, body: { name: 'test.X' } })).status).toBe(403);
    expect((await api.post(`/api/units/${litroId}/deactivate`, { token: almacenista })).status).toBe(403);
  });
});
