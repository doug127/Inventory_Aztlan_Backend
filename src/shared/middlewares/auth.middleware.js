import jwt from 'jsonwebtoken';
import { AppError } from '../errors/AppError.js';

// Verifica la sesión. La reescritura completa (access token de 15 min, refresh, password_changed_at)
// corresponde a HU-101/HU-102 del Sprint 2.
export const auth = (req, _res, next) => {
  const token = req.cookies?.session;
  if (!token) return next(new AppError('AUTH_TOKEN_MISSING'));

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    return next();
  } catch (err) {
    const code = err?.name === 'TokenExpiredError' ? 'AUTH_TOKEN_EXPIRED' : 'AUTH_TOKEN_INVALID';
    return next(new AppError(code, { cause: err }));
  }
};
