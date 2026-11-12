import { ERROR_CATALOG } from './errorCatalog.js';

/**
 * Error esperado de la aplicación. Siempre lleva un código del catálogo.
 *
 *   throw new AppError('NOT_FOUND', { message: `Activo ${code} no encontrado` });
 *   throw new AppError('INSUFFICIENT_STOCK', { message: '...', details: { productCode, available, requested } });
 */
export class AppError extends Error {
  /**
   * @param {keyof typeof ERROR_CATALOG} code
   * @param {{ message?: string, details?: unknown, cause?: unknown }} [options]
   */
  constructor(code, { message, details, cause } = {}) {
    const known = Object.hasOwn(ERROR_CATALOG, code);
    const entry = known ? ERROR_CATALOG[code] : ERROR_CATALOG.INTERNAL_ERROR;
    super(message ?? entry.message, { cause });
    this.name = 'AppError';
    this.code = known ? code : 'INTERNAL_ERROR';
    this.status = entry.status;
    this.details = details;
    // Los 5xx nunca exponen mensaje ni detalles al cliente.
    this.expose = entry.status < 500;
  }
}
