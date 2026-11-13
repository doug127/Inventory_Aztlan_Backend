import { AppError } from '../errors/AppError.js';
import { verifyAccessToken } from '#src/modules/auth/token.service.js';
import { resolveSessionUser } from '#src/modules/auth/auth.service.js';

// Lo único que puede hacer un usuario con must_change_password = true (business_rules.md §9.2.4).
const ALLOWED_WHILE_PASSWORD_CHANGE_REQUIRED = new Set([
  'GET /api/auth/me',
  'POST /api/auth/change-password',
  'POST /api/auth/logout',
]);

/**
 * Verifica la sesión: header "Authorization: Bearer <access token>", firma y vigencia del token,
 * usuario activo y token emitido después del último cambio de contraseña.
 * Si el usuario debe cambiar su contraseña temporal, solo lo deja pasar a las rutas de arriba.
 * Deja en req.user: { id, username, roleCode, hierarchy, mustChangePassword }.
 *
 * Es async: en Express 5 un throw aquí llega al errorHandler.
 */
export const auth = async (req, _res, next) => {
  const header = req.get('Authorization');
  if (!header?.startsWith('Bearer ')) throw new AppError('AUTH_TOKEN_MISSING');

  const payload = verifyAccessToken(header.slice(7).trim());
  const user = await resolveSessionUser(payload);

  if (user.mustChangePassword && !ALLOWED_WHILE_PASSWORD_CHANGE_REQUIRED.has(`${req.method} ${req.baseUrl}${req.path}`)) {
    throw new AppError('AUTH_PASSWORD_CHANGE_REQUIRED');
  }

  req.user = user;
  next();
};
