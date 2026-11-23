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
