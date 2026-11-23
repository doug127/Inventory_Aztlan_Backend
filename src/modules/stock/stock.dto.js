import { z } from 'zod';

const Quantity = z.string().regex(/^\d+\.\d{3}$/);

/** Existencia de cada producto en un almacén (formulario de la orden de retiro). */
export const AvailabilityDto = z.object({
  warehouse: z.object({ id: z.number().int(), code: z.string(), name: z.string() }),
  items: z.array(z.object({ productId: z.number().int(), code: z.string(), unitCode: z.string(), available: Quantity })),
});

export const toAvailabilityDto = ({ warehouse, items }) =>
  AvailabilityDto.parse({
    warehouse: { id: warehouse.id, code: warehouse.code, name: warehouse.name },
    items: items.map(({ productId, code, unitCode, available }) => ({ productId, code, unitCode, available })),
  });
