import { z } from 'zod';
import Decimal from 'decimal.js';

/** Cantidades con 3 decimales, como se muestran en el inventario ("350.000"). */
export const formatQuantity = (value) => new Decimal(value).toFixed(3);

const RefDto = z.object({ id: z.number().int(), code: z.string(), name: z.string(), isActive: z.boolean() });

export const ProductDto = z.object({
  id: z.number().int(),
  code: z.string(),
  name: z.string(),
  category: RefDto,
  unit: RefDto,
  minStock: z.string(),
  maxStock: z.string().nullable(),
  isActive: z.boolean(),
  // Existencia total en todos los almacenes (en la unidad del producto).
  // inWarehouse solo viene al listar con withStockIn: la existencia en ese almacén.
  stock: z.object({
    total: z.string(),
    warehousesWithStock: z.number().int(),
    isEmpty: z.boolean(),
    inWarehouse: z.object({ warehouseId: z.number().int(), quantity: z.string() }).optional(),
  }),
  // Con movimientos no cambian la unidad, la categoría ni el código (business_rules.md §6.4).
  hasMovements: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const toRef = (r) => ({ id: r.id, code: r.code, name: r.name, isActive: r.isActive });

export const toProductDto = (product, { warehouseId } = {}) => {
  const warehousesWithStock = Number(product.warehousesWithStock ?? 0);
  const inWarehouse = warehouseId ? { warehouseId, quantity: formatQuantity(product.stockInWarehouse ?? 0) } : undefined;
  return ProductDto.parse({
    id: product.id,
    code: product.code,
    name: product.name,
    category: toRef(product.category),
    unit: toRef(product.unit),
    minStock: formatQuantity(product.minStock),
    maxStock: product.maxStock === null || product.maxStock === undefined ? null : formatQuantity(product.maxStock),
    isActive: product.isActive,
    stock: { total: formatQuantity(product.totalStock ?? 0), warehousesWithStock, isEmpty: warehousesWithStock === 0, ...(inWarehouse && { inWarehouse }) },
    hasMovements: Boolean(product.hasMovements),
    createdAt: new Date(product.createdAt),
    updatedAt: new Date(product.updatedAt),
  });
};
