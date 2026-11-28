import { z } from 'zod';

/** ?warehouseId=2&productIds=1,5,8 — hasta 100 productos por consulta. */
export const AvailabilityQuerySchema = z.object({
  warehouseId: z.coerce.number({ error: 'warehouseId es obligatorio' }).int('warehouseId debe ser un entero').positive('warehouseId debe ser positivo'),
  productIds: z
    .string({ error: 'productIds es obligatorio' })
    .trim()
    .transform((value) => [...new Set(value.split(',').map((v) => v.trim()).filter(Boolean).map(Number))])
    .refine((ids) => ids.length > 0 && ids.length <= 100 && ids.every((id) => Number.isInteger(id) && id > 0), {
      error: 'productIds debe ser una lista de 1 a 100 ids separados por coma',
    }),
});

const optionalId = (name) =>
  z.coerce.number({ error: `${name} debe ser un número` }).int(`${name} debe ser un entero`).positive(`${name} debe ser positivo`).optional();

/**
 * Existencias (HU-407, user_flow.md §4). groupBy: product (una fila por producto, por defecto) o
 * warehouse (una por producto y almacén). alert: BAJO_MINIMO, SOBRE_MAXIMO o CON_ALERTA (cualquiera de
 * las dos); "true" equivale a CON_ALERTA (enlace del dashboard /stock?alert=true).
 */
export const ListStockQuerySchema = z.object({
  page: z.coerce.number().int('page debe ser un entero').min(1, 'page debe ser mayor o igual a 1').default(1),
  limit: z.coerce.number().int('limit debe ser un entero').min(1, 'limit mínimo 1').max(100, 'limit máximo 100').default(10),
  search: z.string().trim().max(150, 'La búsqueda es demasiado larga').optional().transform((v) => v || undefined),
  warehouseId: optionalId('warehouseId'),
  categoryId: optionalId('categoryId'),
  alert: z
    .enum(['BAJO_MINIMO', 'SOBRE_MAXIMO', 'CON_ALERTA', 'true'], { error: 'alert es BAJO_MINIMO, SOBRE_MAXIMO o CON_ALERTA' })
    .optional()
    .transform((v) => (v === 'true' ? 'CON_ALERTA' : v)),
  groupBy: z.enum(['product', 'warehouse'], { error: 'groupBy es product o warehouse' }).default('product'),
});
