// Manejador de errores central: el ÚNICO lugar que construye la respuesta de error.
//   { success: false, error: { code, message, details?, requestId } }
// Controllers y services solo lanzan AppError (o dejan pasar el error); nunca responden errores.
import { ZodError } from 'zod';
import { AppError } from '../errors/AppError.js';
import { mapDatabaseError } from '../errors/mapDatabaseError.js';

export const normalizeError = (err) => {
  if (err instanceof AppError) return err;

  const dbError = mapDatabaseError(err);
  if (dbError) return dbError;

  if (err instanceof ZodError) {
    // La entrada se valida en el middleware validate; un ZodError que llega aquí viene de un DTO
    // de salida, así que es un bug del servidor y no del cliente.
    return new AppError('RESPONSE_CONTRACT_ERROR', { details: err.issues, cause: err });
  }
  if (err?.type === 'entity.parse.failed') {
    return new AppError('VALIDATION_ERROR', { message: 'El cuerpo de la petición no es JSON válido' });
  }
  if (err?.type === 'entity.too.large') {
    return new AppError('VALIDATION_ERROR', { message: 'El cuerpo de la petición es demasiado grande' });
  }
  return new AppError('INTERNAL_ERROR', { cause: err });
};

// Express reconoce el manejador de errores por sus 4 parámetros.
export const errorHandler = (err, req, res, _next) => {
  const error = normalizeError(err);
  const original = error.cause ?? err;

  // El requestLogger escribe la línea con estos datos cuando termina la respuesta.
  res.locals.error = {
    code: error.code,
    message: error.status >= 500 ? (original?.message ?? error.message) : error.message,
    constraint: error.details?.constraint,
    stack: error.status >= 500 ? (original?.stack ?? error.stack) : undefined,
    contractIssues: error.code === 'RESPONSE_CONTRACT_ERROR' ? error.details : undefined,
  };

  if (res.headersSent) return;

  // Bloqueos y límites de frecuencia indican cuándo reintentar (estándar HTTP).
  if (error.expose && Number.isInteger(error.details?.retryAfterSeconds)) {
    res.set('Retry-After', String(error.details.retryAfterSeconds));
  }

  res.status(error.status).json({
    success: false,
    error: {
      code: error.code,
      message: error.expose ? error.message : 'Error interno del servidor',
      ...(error.expose && error.details !== undefined && { details: error.details }),
      requestId: req.id,
    },
  });
};
