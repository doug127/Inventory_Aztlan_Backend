import { describe, it, expect } from 'vitest';
import { AppError } from '#src/shared/errors/AppError.js';
import { ERROR_CATALOG, ERROR_CODES } from '#src/shared/errors/errorCatalog.js';

describe('AppError', () => {
  it('toma status y mensaje del catálogo', () => {
    const error = new AppError('INSUFFICIENT_STOCK');
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('INSUFFICIENT_STOCK');
    expect(error.status).toBe(409);
    expect(error.message).toBe(ERROR_CATALOG.INSUFFICIENT_STOCK.message);
    expect(error.expose).toBe(true);
  });

  it('acepta un mensaje concreto, detalles y causa', () => {
    const cause = new Error('origen');
    const error = new AppError('NOT_FOUND', { message: 'Activo T-09 no encontrado', details: { code: 'T-09' }, cause });
    expect(error.message).toBe('Activo T-09 no encontrado');
    expect(error.details).toEqual({ code: 'T-09' });
    expect(error.cause).toBe(cause);
  });

  it('convierte un código desconocido en INTERNAL_ERROR no expuesto', () => {
    const error = new AppError('NO_EXISTE');
    expect(error.code).toBe('INTERNAL_ERROR');
    expect(error.status).toBe(500);
    expect(error.expose).toBe(false);
  });
});

describe('ERROR_CATALOG', () => {
  // Códigos de documentation/naming_conventions.md §11. Si se agrega uno allí, debe existir aquí.
  const DOCUMENTED = [
    'AUTH_INVALID_CREDENTIALS', 'AUTH_ACCOUNT_LOCKED', 'AUTH_ACCOUNT_INACTIVE', 'AUTH_TOKEN_EXPIRED',
    'AUTH_TOKEN_INVALID', 'AUTH_PASSWORD_CHANGE_REQUIRED', 'AUTH_RESET_TOKEN_INVALID', 'AUTH_WEAK_PASSWORD',
    'AUTH_RATE_LIMITED', 'FORBIDDEN_ROLE', 'FORBIDDEN_HIERARCHY', 'LAST_SUPERADMIN', 'INSUFFICIENT_STOCK',
    'INVALID_MOVEMENT_WAREHOUSES', 'INVALID_MOVEMENT_REASON', 'ASSET_REQUIRED', 'ASSET_NOT_ALLOWED',
    'RETURN_EXCEEDS_LOAN', 'MOVEMENT_DATE_INVALID', 'MOVEMENT_IMMUTABLE', 'EMPTY_MOVEMENT', 'DUPLICATE_REQUEST',
    'NOT_FOUND', 'INACTIVE_RESOURCE', 'DUPLICATE_CODE', 'INVALID_CODE_FORMAT', 'CATEGORY_CYCLE',
    'CATEGORY_NOT_LEAF', 'CATEGORY_HAS_ASSETS', 'HAS_STOCK', 'HAS_DEPENDENCIES', 'UNIT_CHANGE_FORBIDDEN',
    'VALIDATION_ERROR',
  ];

  it('contiene todos los códigos documentados', () => {
    for (const code of DOCUMENTED) expect(ERROR_CATALOG, code).toHaveProperty(code);
  });

  it('cada entrada tiene un status HTTP válido y un mensaje', () => {
    for (const [code, entry] of Object.entries(ERROR_CATALOG)) {
      expect(entry.status, code).toBeGreaterThanOrEqual(400);
      expect(entry.status, code).toBeLessThan(600);
      expect(entry.message, code).toBeTruthy();
      expect(ERROR_CODES[code]).toBe(code);
    }
  });
});
