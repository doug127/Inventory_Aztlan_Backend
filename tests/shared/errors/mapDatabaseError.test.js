import { describe, it, expect } from 'vitest';
import {
  ConnectionError,
  DatabaseError,
  ForeignKeyConstraintError,
  UniqueConstraintError,
  ValidationError,
  ValidationErrorItem,
} from 'sequelize';
import { mapDatabaseError } from '#src/shared/errors/mapDatabaseError.js';

// Simula el error que entrega `pg` (con el mensaje traducido, como en el servidor del proyecto).
const pgError = (fields) =>
  Object.assign(new Error(fields.message ?? 'mensaje traducido por el servidor'), { severity: 'ERROR', ...fields });

describe('mapDatabaseError', () => {
  it('devuelve null para errores que no son de base de datos', () => {
    expect(mapDatabaseError(new Error('cualquier cosa'))).toBeNull();
    expect(mapDatabaseError(null)).toBeNull();
  });

  it('UNIQUE con constraint conocida usa su código y mensaje', () => {
    const parent = pgError({ code: '23505', constraint: 'uq_users_email' });
    const error = mapDatabaseError(new UniqueConstraintError({ parent }));
    expect(error.code).toBe('DUPLICATE_CODE');
    expect(error.message).toBe('El correo ya está registrado');
    expect(error.details).toEqual({ constraint: 'uq_users_email' });
  });

  it('UNIQUE de idempotency_key es DUPLICATE_REQUEST', () => {
    const parent = pgError({ code: '23505', constraint: 'uq_movement_headers_idempotency_key' });
    expect(mapDatabaseError(new UniqueConstraintError({ parent })).code).toBe('DUPLICATE_REQUEST');
  });

  it('UNIQUE desconocida cae en DUPLICATE_CODE', () => {
    const parent = pgError({ code: '23505', constraint: 'uq_algo_nuevo' });
    expect(mapDatabaseError(new UniqueConstraintError({ parent })).code).toBe('DUPLICATE_CODE');
  });

  it.each([
    ['chk_stock_quantity', 'INSUFFICIENT_STOCK'],
    ['chk_movement_warehouses', 'INVALID_MOVEMENT_WAREHOUSES'],
    ['chk_movement_reason', 'INVALID_MOVEMENT_REASON'],
    ['chk_products_code', 'INVALID_CODE_FORMAT'],
    ['chk_product_categories_parent', 'CATEGORY_CYCLE'],
    ['chk_desconocido', 'VALIDATION_ERROR'],
  ])('CHECK %s → %s', (constraint, code) => {
    const error = mapDatabaseError(new DatabaseError(pgError({ code: '23514', constraint })));
    expect(error.code).toBe(code);
    expect(error.details).toEqual({ constraint });
  });

  it('trigger de inmutabilidad (P0001) usa el código del mensaje', () => {
    const parent = pgError({
      code: 'P0001',
      message: 'MOVEMENT_IMMUTABLE: los movimientos no se modifican ni se eliminan (movement_headers)',
    });
    const error = mapDatabaseError(new DatabaseError(parent));
    expect(error.code).toBe('MOVEMENT_IMMUTABLE');
    expect(error.status).toBe(409);
    expect(error.message).toBe('los movimientos no se modifican ni se eliminan (movement_headers)');
  });

  it('trigger de regla de activo (23514 sin constraint) usa el código del mensaje', () => {
    const parent = pgError({ code: '23514', message: 'ASSET_REQUIRED: OUT / CONSUMO exige un activo en cada línea' });
    const error = mapDatabaseError(new DatabaseError(parent));
    expect(error.code).toBe('ASSET_REQUIRED');
    expect(error.message).toBe('OUT / CONSUMO exige un activo en cada línea');
  });

  it('RAISE con un código que no está en el catálogo no se traduce', () => {
    expect(mapDatabaseError(new DatabaseError(pgError({ code: 'P0001', message: 'OTRA_COSA: x' })))).toBeNull();
  });

  it('FK en DELETE es HAS_DEPENDENCIES y en INSERT es NOT_FOUND', () => {
    const onDelete = pgError({ code: '23503', constraint: 'fk_products_unit_id', sql: 'DELETE FROM "units" WHERE id = 1' });
    const onInsert = pgError({ code: '23503', constraint: 'fk_products_unit_id', sql: 'INSERT INTO "products" ...' });
    expect(mapDatabaseError(new ForeignKeyConstraintError({ parent: onDelete })).code).toBe('HAS_DEPENDENCIES');
    expect(mapDatabaseError(new ForeignKeyConstraintError({ parent: onInsert })).code).toBe('NOT_FOUND');
  });

  it('ON DELETE RESTRICT (23001) es HAS_DEPENDENCIES', () => {
    const parent = pgError({ code: '23001', constraint: 'fk_units_base_unit_id', sql: 'DELETE FROM units' });
    const error = mapDatabaseError(new DatabaseError(parent));
    expect(error.code).toBe('HAS_DEPENDENCIES');
    expect(error.details).toEqual({ constraint: 'fk_units_base_unit_id' });
  });

  it('NOT NULL indica la columna', () => {
    const error = mapDatabaseError(new DatabaseError(pgError({ code: '23502', column: 'full_name' })));
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details).toEqual({ column: 'full_name' });
  });

  it('valor mal formado (ENUM/UUID) es VALIDATION_ERROR', () => {
    expect(mapDatabaseError(new DatabaseError(pgError({ code: '22P02' }))).code).toBe('VALIDATION_ERROR');
  });

  it('validaciones de modelo de Sequelize son VALIDATION_ERROR con detalle por campo', () => {
    const err = new ValidationError('x', [new ValidationErrorItem('Nombre requerido', 'notNull violation', 'name')]);
    const error = mapDatabaseError(err);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details).toEqual([{ location: 'model', path: 'name', message: 'Nombre requerido' }]);
  });

  it('error de conexión es INTERNAL_ERROR no expuesto', () => {
    const error = mapDatabaseError(new ConnectionError(new Error('ECONNREFUSED')));
    expect(error.code).toBe('INTERNAL_ERROR');
    expect(error.expose).toBe(false);
  });

  it('acepta errores crudos de pg (sin envoltorio de Sequelize)', () => {
    expect(mapDatabaseError(pgError({ code: '23514', constraint: 'chk_stock_quantity' })).code).toBe('INSUFFICIENT_STOCK');
  });
});
