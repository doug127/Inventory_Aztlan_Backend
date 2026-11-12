import { z } from 'zod';
import { AppError } from '../errors/AppError.js';

const PARTS = ['params', 'query', 'body', 'headers'];

/**
 * validate(Schema)                            → valida req.body
 * validate(Schema, 'query')                   → valida esa parte (forma usada por las rutas actuales)
 * validate({ body, query, params, headers })  → valida cada parte indicada
 *
 * El resultado parseado queda en req.validated.{body,query,params,headers}.
 * Mientras dure el refactor REF-S1 también se deja en req.validatedData (la última parte validada),
 * que es lo que leen los controllers actuales.
 */
export const validate = (schemas, property = 'body') => {
  const shape = schemas instanceof z.ZodType ? { [property]: schemas } : schemas;

  return (req, _res, next) => {
    req.validated ??= {};
    const issues = [];

    for (const part of PARTS) {
      if (!shape[part]) continue;
      const result = shape[part].safeParse(req[part] ?? {});
      if (result.success) {
        req.validated[part] = result.data;
        req.validatedData = result.data;
      } else {
        issues.push(
          ...result.error.issues.map((issue) => ({
            location: part,
            path: issue.path.join('.'),
            message: issue.message,
          }))
        );
      }
    }

    if (issues.length) return next(new AppError('VALIDATION_ERROR', { details: issues }));
    return next();
  };
};
