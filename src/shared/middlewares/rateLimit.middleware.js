import { rateLimit } from 'express-rate-limit';
import { AppError } from '../errors/AppError.js';
import { LOGIN_RATE_LIMIT_DEFAULT, LOGIN_RATE_LIMIT_WINDOW_MS } from '../constants/auth.js';

/**
 * Limitador por IP que responde con el sobre estándar (AUTH_RATE_LIMITED, 429) a través del
 * errorHandler, en lugar del texto plano que trae express-rate-limit por defecto.
 * El contador vive en memoria del proceso: suficiente para un solo servidor en la red interna.
 */
export const createRateLimiter = ({ windowMs, limit, message, skipSuccessfulRequests = false }) =>
  rateLimit({
    windowMs,
    limit,
    skipSuccessfulRequests,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, _res, next) => {
      const resetTime = req.rateLimit?.resetTime;
      const retryAfterSeconds = resetTime
        ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
        : Math.ceil(windowMs / 1000);
      next(new AppError('AUTH_RATE_LIMITED', { message, details: { retryAfterSeconds } }));
    },
  });

/**
 * Login: 10 intentos fallidos por minuto por IP (configurable con LOGIN_RATE_LIMIT_PER_MINUTE).
 * Los logins exitosos no cuentan, para no castigar a varios usuarios legítimos detrás de la misma IP.
 * Complementa el bloqueo por cuenta: frena a quien prueba muchos usuarios distintos desde un equipo.
 */
export const loginRateLimiter = createRateLimiter({
  windowMs: LOGIN_RATE_LIMIT_WINDOW_MS,
  limit: Number(process.env.LOGIN_RATE_LIMIT_PER_MINUTE) || LOGIN_RATE_LIMIT_DEFAULT,
  message: 'Demasiados intentos de inicio de sesión desde este equipo. Espere un minuto.',
  skipSuccessfulRequests: true,
});
