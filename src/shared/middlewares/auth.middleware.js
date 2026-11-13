import { AppError } from '../errors/AppError.js';
import { verifyAccessToken } from '#src/modules/auth/token.service.js';
import { resolveSessionUser } from '#src/modules/auth/auth.service.js';

/**
 * Verifica la sesión: header "Authorization: Bearer <access token>", firma y vigencia del token,
 * usuario activo y token emitido después del último cambio de contraseña.
 * Deja en req.user: { id, username, roleCode, hierarchy, mustChangePassword }.
 *
 * Es async: en Express 5 un throw aquí llega al errorHandler.
 * La restricción por must_change_password llega con HU-104.
 */
export const auth = async (req, _res, next) => {
  const header = req.get('Authorization');
  if (!header?.startsWith('Bearer ')) throw new AppError('AUTH_TOKEN_MISSING');

  const payload = verifyAccessToken(header.slice(7).trim());
  req.user = await resolveSessionUser(payload);
  next();
};
