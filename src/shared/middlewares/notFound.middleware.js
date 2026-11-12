import { AppError } from '../errors/AppError.js';

export const notFound = (req, _res, next) =>
  next(new AppError('ROUTE_NOT_FOUND', { message: `No existe ${req.method} ${req.path}` }));
