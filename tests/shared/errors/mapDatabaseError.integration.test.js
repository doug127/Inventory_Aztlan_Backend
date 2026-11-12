// Integración con PostgreSQL real: provoca cada tipo de error dentro de una transacción que se
// revierte (no deja datos) y comprueba la traducción con los mensajes reales del servidor,
// que está configurado en español. Se omite si no hay conexión a la base de datos.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sequelize } from '#src/config/database.js';
import { mapDatabaseError } from '#src/shared/errors/mapDatabaseError.js';

let connected = false;

beforeAll(async () => {
  try {
    await sequelize.authenticate();
    connected = true;
  } catch {
    connected = false;
  }
});

afterAll(async () => {
  await sequelize.close();
});

// Ejecuta sql dentro de una transacción que siempre se revierte y devuelve el error traducido.
const mapped = async (setupSql, failingSql) => {
  const t = await sequelize.transaction();
  try {
    if (setupSql) await sequelize.query(setupSql, { transaction: t });
    await sequelize.query(failingSql, { transaction: t });
    throw new Error('Se esperaba que la sentencia fallara');
  } catch (err) {
    return mapDatabaseError(err) ?? err;
  } finally {
    await t.rollback();
  }
};

const newOutHeader = `
  INSERT INTO movement_headers (document_number, movement_type, reason, created_by_user_id, warehouse_from_id, received_by)
  SELECT 'RET-999999', 'OUT', 'CONSUMO', u.id, w.id, 'Prueba'
  FROM users u, warehouses w WHERE u.username = 'superadmin' AND w.code = 'COMB';`;

describe('mapDatabaseError con PostgreSQL real', () => {
  it('UNIQUE: almacén con código repetido → DUPLICATE_CODE', async (ctx) => {
    if (!connected) return ctx.skip();
    const error = await mapped(null, `INSERT INTO warehouses (code, name) VALUES ('COMB', 'Otro nombre')`);
    expect(error.code).toBe('DUPLICATE_CODE');
    expect(error.details).toEqual({ constraint: 'uq_warehouses_code' });
  });

  it('CHECK: stock negativo → INSUFFICIENT_STOCK', async (ctx) => {
    if (!connected) return ctx.skip();
    const error = await mapped(null, `
      INSERT INTO stock (product_id, warehouse_id, quantity)
      SELECT p.id, w.id, -1 FROM products p, warehouses w WHERE p.code = 'COMB-0001' AND w.code = 'COMB'`);
    expect(error.code).toBe('INSUFFICIENT_STOCK');
  });

  it('CHECK: formato de código → INVALID_CODE_FORMAT', async (ctx) => {
    if (!connected) return ctx.skip();
    const error = await mapped(null, `INSERT INTO warehouses (code, name) VALUES ('co', 'Almacén x')`);
    expect(error.code).toBe('INVALID_CODE_FORMAT');
  });

  it('CHECK de cabecera: OUT con motivo COMPRA → INVALID_MOVEMENT_REASON', async (ctx) => {
    if (!connected) return ctx.skip();
    const error = await mapped(null, newOutHeader.replace("'CONSUMO'", "'COMPRA'"));
    expect(error.code).toBe('INVALID_MOVEMENT_REASON');
  });

  it('trigger: línea de CONSUMO sin activo → ASSET_REQUIRED', async (ctx) => {
    if (!connected) return ctx.skip();
    const error = await mapped(newOutHeader, `
      INSERT INTO movement_lines (movement_header_id, product_id, quantity)
      SELECT h.id, p.id, 10 FROM movement_headers h, products p
      WHERE h.document_number = 'RET-999999' AND p.code = 'COMB-0001'`);
    expect(error.code).toBe('ASSET_REQUIRED');
    expect(error.status).toBe(400);
  });

  it('trigger: UPDATE de un movimiento → MOVEMENT_IMMUTABLE', async (ctx) => {
    if (!connected) return ctx.skip();
    const error = await mapped(newOutHeader, `UPDATE movement_headers SET note = 'x' WHERE document_number = 'RET-999999'`);
    expect(error.code).toBe('MOVEMENT_IMMUTABLE');
    expect(error.status).toBe(409);
  });

  it('FK en INSERT: unidad inexistente → NOT_FOUND', async (ctx) => {
    if (!connected) return ctx.skip();
    const error = await mapped(null, `
      INSERT INTO products (code, name, product_category_id, unit_id)
      SELECT 'COMB-0999', 'Prueba', c.id, 999999 FROM product_categories c WHERE c.code = 'COMB'`);
    expect(error.code).toBe('NOT_FOUND');
  });

  it('FK en DELETE: unidad usada por productos → HAS_DEPENDENCIES', async (ctx) => {
    if (!connected) return ctx.skip();
    const error = await mapped(null, `DELETE FROM units WHERE code = 'L'`);
    expect(error.code).toBe('HAS_DEPENDENCIES');
  });

  it('valor de ENUM inválido → VALIDATION_ERROR', async (ctx) => {
    if (!connected) return ctx.skip();
    const error = await mapped(null, newOutHeader.replace("'CONSUMO'", "'REGALO'"));
    expect(error.code).toBe('VALIDATION_ERROR');
  });
});
