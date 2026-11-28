import { z } from 'zod';
import { MOVEMENT_REASONS, MOVEMENT_TYPES, REASONS_BY_TYPE } from '#src/shared/constants/movements.js';

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

/** Cortes del resumen por período del reporte de movimientos (HU-502). */
export const MOVEMENT_INTERVALS = ['day', 'week', 'month'];

/**
 * Reporte de movimientos por período (HU-502, user_flow.md §14). Filtros: período (from/to
 * 'AAAA-MM-DD' inclusive), tipo, motivo (compatible con el tipo), almacén, producto y categoría de
 * producto (con sus subcategorías). interval: corte de la serie por período (día, semana o mes).
 */
export const MovementsReportQuerySchema = z
  .object({
    from: dayFilter('from'),
    to: dayFilter('to'),
    movementType: z.enum(Object.values(MOVEMENT_TYPES), { error: 'movementType es IN, OUT, TRANSFER o ADJUST' }).optional(),
    reason: z.enum(Object.values(MOVEMENT_REASONS), { error: 'Motivo desconocido' }).optional(),
    warehouseId: optionalId('warehouseId'),
    productId: optionalId('productId'),
    productCategoryId: optionalId('productCategoryId'),
    interval: z.enum(MOVEMENT_INTERVALS, { error: 'interval es day, week o month' }).default('month'),
    page: z.coerce.number().int('page debe ser un entero').min(1, 'page debe ser mayor o igual a 1').default(1),
    limit: z.coerce.number().int('limit debe ser un entero').min(1, 'limit mínimo 1').max(100, 'limit máximo 100').default(10),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, { error: 'La fecha inicial no puede ser posterior a la final', path: ['from'] })
  .refine((q) => !q.movementType || !q.reason || REASONS_BY_TYPE[q.movementType].includes(q.reason), {
    error: 'El motivo no corresponde al tipo de movimiento',
    path: ['reason'],
  });
