import { z } from 'zod';

const optionalId = (name) =>
  z.coerce.number({ error: `${name} debe ser un número` }).int(`${name} debe ser un entero`).positive(`${name} debe ser positivo`).optional();
const dayFilter = (name) => z.iso.date({ error: `${name} es una fecha AAAA-MM-DD` }).optional();

/** Agrupaciones del reporte de consumo (user_flow.md §14). */
export const CONSUMPTION_GROUPS = ['asset', 'assetCategory'];

/**
 * Reporte de consumo (HU-501, user_flow.md §14). groupBy: asset (una fila por activo y producto) o
 * assetCategory (una por categoría y producto: las hijas de assetCategoryId o, sin él, las raíces).
 * Las categorías incluyen sus subcategorías. from/to: 'AAAA-MM-DD' inclusive. Todos son opcionales.
 */
export const ConsumptionReportQuerySchema = z
  .object({
    groupBy: z.enum(CONSUMPTION_GROUPS, { error: 'groupBy es asset o assetCategory' }).default('asset'),
    from: dayFilter('from'),
    to: dayFilter('to'),
    productId: optionalId('productId'),
    productCategoryId: optionalId('productCategoryId'),
    assetId: optionalId('assetId'),
    assetCategoryId: optionalId('assetCategoryId'),
    page: z.coerce.number().int('page debe ser un entero').min(1, 'page debe ser mayor o igual a 1').default(1),
    limit: z.coerce.number().int('limit debe ser un entero').min(1, 'limit mínimo 1').max(100, 'limit máximo 100').default(10),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, { error: 'La fecha inicial no puede ser posterior a la final', path: ['from'] });
