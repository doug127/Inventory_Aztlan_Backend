import { logger } from '../logging/logger.js';

const SENSITIVE_QUERY = /([?&](?:token|password|refreshToken)=)[^&]*/gi;
export const sanitizeUrl = (url) => url.replace(SENSITIVE_QUERY, '$1[REDACTED]');

// Mientras auth se reescribe (Sprint 2), el payload del JWT puede traer el rol con distintas formas.
const describeUser = (user) => {
  if (!user) return 'anon';
  const name = user.username ?? user.sub ?? user.id ?? '?';
  const role = user.roleCode ?? user.role_code ?? user.role?.code ?? user.role ?? '?';
  return `${name}(${role})`;
};

// Una línea por petición, escrita al terminar la respuesta para tener el status y la duración reales.
// El errorHandler deja en res.locals.error el código y el mensaje antes de responder.
export const requestLogger = (req, res, next) => {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    const status = res.statusCode;
    const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
    const error = res.locals.error;

    logger[level](
      req.method,
      sanitizeUrl(req.originalUrl),
      status,
      {
        ms: ms.toFixed(1),
        req: req.id?.slice(0, 8),
        user: describeUser(req.user),
        ...res.locals.log,
        ...(error && { code: error.code, msg: error.message, constraint: error.constraint }),
        ...(error?.contractIssues && { issues: error.contractIssues }),
      },
      error?.stack
    );
  });

  next();
};
