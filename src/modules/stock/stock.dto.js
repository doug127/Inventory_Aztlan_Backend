import Decimal from 'decimal.js';
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

/** Estados de una fila de existencias (business_rules.md §7). */
export const STOCK_STATUSES = ['NORMAL', 'BAJO_MINIMO', 'SOBRE_MAXIMO'];

const WarehouseQuantity = z.object({ id: z.number().int(), code: z.string(), name: z.string(), quantity: Quantity });

/**
 * Fila de existencias (HU-407). quantity es la del almacén de la fila (o del filtrado) y, sin almacén,
 * el total. total y status siempre se refieren a todos los almacenes. warehouses (vista por producto)
 * desglosa dónde está; en la vista por almacén es null.
 */
export const StockRowDto = z.object({
  product: z.object({ id: z.number().int(), code: z.string(), name: z.string(), unitCode: z.string() }),
  category: z.object({ id: z.number().int(), code: z.string(), name: z.string() }),
  warehouse: z.object({ id: z.number().int(), code: z.string(), name: z.string() }).nullable(),
  quantity: Quantity,
  total: Quantity,
  minStock: Quantity,
  maxStock: Quantity.nullable(),
  status: z.enum(STOCK_STATUSES),
  warehouses: z.array(WarehouseQuantity).nullable(),
});

const q3 = (value) => new Decimal(value).toFixed(3);

export const toStockRowDto = (row, { groupBy }) =>
  StockRowDto.parse({
    product: { id: row.productId, code: row.productCode, name: row.productName, unitCode: row.unitCode },
    category: { id: row.categoryId, code: row.categoryCode, name: row.categoryName },
    warehouse: row.warehouseId ? { id: row.warehouseId, code: row.warehouseCode, name: row.warehouseName } : null,
    quantity: q3(row.quantity),
    total: q3(row.total),
    minStock: q3(row.minStock),
    maxStock: row.maxStock === null ? null : q3(row.maxStock),
    status: row.status,
    warehouses: groupBy === 'warehouse' ? null : (row.warehouses ?? []).map((w) => ({ id: w.id, code: w.code, name: w.name, quantity: q3(w.quantity) })),
  });

/** Productos por estado en el alcance filtrado (sin el filtro de estado): { total, normal, bajoMinimo, sobreMaximo }. */
export const toStockSummaryDto = (rows) => {
  const count = (status) => rows.find((r) => r.status === status)?.count ?? 0;
  const normal = count('NORMAL');
  const bajoMinimo = count('BAJO_MINIMO');
  const sobreMaximo = count('SOBRE_MAXIMO');
  return { total: normal + bajoMinimo + sobreMaximo, normal, bajoMinimo, sobreMaximo };
};
