import { z } from 'zod';

// Lo que ve el frontend de cada almacén. `stock.productsWithStock` permite habilitar [Desactivar]
// solo cuando el almacén está vacío (user_flow.md §11).
export const WarehouseDto = z.object({
  id: z.number().int(),
  code: z.string(),
  name: z.string(),
  isActive: z.boolean(),
  stock: z.object({
    productsWithStock: z.number().int(),
    isEmpty: z.boolean(),
  }),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const toWarehouseDto = (warehouse) => {
  const productsWithStock = Number(warehouse.productsWithStock ?? 0);
  return WarehouseDto.parse({
    id: warehouse.id,
    code: warehouse.code,
    name: warehouse.name,
    isActive: warehouse.isActive,
    stock: { productsWithStock, isEmpty: productsWithStock === 0 },
    createdAt: new Date(warehouse.createdAt),
    updatedAt: new Date(warehouse.updatedAt),
  });
};
