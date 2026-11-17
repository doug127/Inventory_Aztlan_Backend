import { AppError } from '#src/shared/errors/AppError.js';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export const isLoopback = (ip) => LOOPBACK.has(ip);

/** Las herramientas de desarrollo existen solo fuera de producción y con ENABLE_DEV_TOOLS=true. */
export const devToolsEnabled = () =>
  process.env.NODE_ENV !== 'production' && process.env.ENABLE_DEV_TOOLS === 'true';

/**
 * Cierra el router /api/dev salvo en desarrollo, con ENABLE_DEV_TOOLS=true y desde el mismo equipo.
 * Si alguna condición falla responde ROUTE_NOT_FOUND, igual que una ruta inexistente: desde fuera
 * no se puede distinguir que el endpoint existe. Se evalúa en cada petición, no al arrancar.
 */
export const devToolsGuard = (req, _res, next) => {
  if (!devToolsEnabled() || !isLoopback(req.ip)) {
    return next(new AppError('ROUTE_NOT_FOUND', { message: `No existe ${req.method} ${req.baseUrl}${req.path}` }));
  }
  return next();
};
