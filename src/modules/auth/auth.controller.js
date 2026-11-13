import * as authService from './auth.service.js';
import { addLogContext, sendNoContent, sendOk } from '#src/shared/http/response.js';
import { REFRESH_COOKIE_NAME, REFRESH_COOKIE_PATH } from '#src/shared/constants/auth.js';

// Sin try/catch: Express 5 lleva cualquier error de una función async al errorHandler.

const requestContext = (req) => ({ ip: req.ip, userAgent: req.get('User-Agent') });

// El refresh token vive solo en esta cookie: JavaScript del navegador no puede leerla (httpOnly),
// no se envía a otros sitios (sameSite=strict) y solo viaja a /api/auth.
// secure exige HTTPS; en desarrollo (http://localhost) se desactiva salvo COOKIE_SECURE=true.
const refreshCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true',
  sameSite: 'strict',
  path: REFRESH_COOKIE_PATH,
});

const setRefreshCookie = (res, { value, expiresAt }) =>
  res.cookie(REFRESH_COOKIE_NAME, value, { ...refreshCookieOptions(), expires: new Date(expiresAt) });

const clearRefreshCookie = (res) => res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions());

export const loginController = async (req, res) => {
  addLogContext(res, { target: req.validated.body.username });
  const { session, refreshToken } = await authService.login(req.validated.body, requestContext(req));
  setRefreshCookie(res, refreshToken);
  return sendOk(res, session);
};

export const refreshController = async (req, res) => {
  try {
    const { session, refreshToken } = await authService.refreshSession(req.cookies?.[REFRESH_COOKIE_NAME], requestContext(req));
    setRefreshCookie(res, refreshToken);
    addLogContext(res, { target: session.user.username });
    return sendOk(res, session);
  } catch (error) {
    // Una cookie que ya no sirve se borra para que el cliente no la siga enviando.
    // No se captura para silenciar: el error sigue su camino al errorHandler.
    clearRefreshCookie(res);
    throw error;
  }
};

export const meController = async (req, res) => sendOk(res, await authService.getCurrentUser(req.user));

export const changePasswordController = async (req, res) => {
  addLogContext(res, { target: req.user.username });
  const { session, refreshToken } = await authService.changePassword(req.user, req.validated.body, requestContext(req));
  setRefreshCookie(res, refreshToken);
  return sendOk(res, session);
};

export const logoutController = async (req, res) => {
  await authService.logout(req.user, req.cookies?.[REFRESH_COOKIE_NAME], requestContext(req));
  clearRefreshCookie(res);
  // Limpia la cookie de sesión del esquema anterior por si el navegador aún la tiene.
  res.clearCookie('session', { httpOnly: true, sameSite: 'lax' });
  return sendNoContent(res);
};
