import express from 'express';
import { AppError } from '../errors/AppError.js';

/**
 * Lee el cuerpo crudo (un archivo) en req.body como Buffer, solo para los Content-Type indicados.
 * Si supera el límite responde con tooLargeCode (413) en lugar del error genérico del parser.
 * Va después de validate({ headers }), que ya rechazó un Content-Type no permitido.
 */
export const rawBody = ({ types, limitBytes, tooLargeCode = 'VALIDATION_ERROR' }) => {
  const parser = express.raw({ type: types, limit: limitBytes });
  return (req, res, next) =>
    parser(req, res, (error) => {
      if (error?.type === 'entity.too.large') return next(new AppError(tooLargeCode));
      if (error) return next(error);
      if (!Buffer.isBuffer(req.body)) req.body = Buffer.alloc(0);
      return next();
    });
};
