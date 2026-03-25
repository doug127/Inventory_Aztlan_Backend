import {Op} from 'sequelize';

/**
 * Parsea del query params los sufijos _gt _gte _lt _lte para un campo dado
 * y devuelve un objeto con las propiedades numéricas si existen.
 * Ejemplo: ?min_stock_gt=10&min_stock_lte=50  => { gt: 10, lte: 50 }
 */

export const parseNumericRangeFromQuery = (query, field) => {
    const out = {};

    const ops = ['gt', 'gte', 'lt', 'lte'];

    ops.forEach(op => {
        const value = query[`${field}_${op}`];
        if (value !== undefined) {
            const num = Number(value);
            if (isNaN(num) || num < 0) {
                throw new Error(`${field}_${op} debe ser un número válido`);
            }
            out[op] = num;
        }
    });

    return Object.keys(out).length ? out : null;
};

export const applyNumericFiltersToWhere = (where, filtersField, dbFieldName) => {
    if(!filtersField) return;

    where[dbFieldName] = {};

    if (filtersField.gt !== undefined) where[dbFieldName][Op.gt] = filtersField.gt;
    if (filtersField.gte !== undefined) where[dbFieldName][Op.gte] = filtersField.gte;
    if (filtersField.lt !== undefined) where[dbFieldName][Op.lt] = filtersField.lt;
    if (filtersField.lte !== undefined) where[dbFieldName][Op.lte] = filtersField.lte;
}

export const getLowerBound = (range) =>
  range?.gt ?? range?.gte ?? null;

export const getUpperBound = (range) =>
  range?.lt ?? range?.lte ?? null;