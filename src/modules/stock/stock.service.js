// Consultas de stock: la existencia por almacén que usan los formularios de movimientos (HU-401) y la
// consulta de existencias por almacén y categoría con alertas (HU-407).
import Decimal from 'decimal.js';
import { AppError } from '#src/shared/errors/AppError.js';
import { getWarehouse } from '#src/modules/warehouse/warehouse.service.js';
import * as stockRepository from './stock.repository.js';
import { getSubtreeIds } from '#src/modules/product/product_category/product_category.service.js';
import { toAvailabilityDto, toStockRowDto, toStockSummaryDto } from './stock.dto.js';

/** Existencia de los productos indicados en el almacén (0 si nunca tuvieron). */
export const getAvailability = async ({ warehouseId, productIds }) => {
  const warehouse = await getWarehouse(warehouseId);
  const rows = await stockRepository.findAvailability(warehouse.id, productIds);
  const found = new Set(rows.map((row) => row.productId));
  const missing = productIds.filter((id) => !found.has(id));
  if (missing.length) throw new AppError('NOT_FOUND', { message: `No existen los productos ${missing.join(', ')}`, details: { productIds: missing } });
  return toAvailabilityDto({
    warehouse,
    items: rows.map((row) => ({ ...row, available: new Decimal(row.available).toFixed(3) })),
  });
};

/**
 * Existencias por almacén y categoría con alertas (HU-407, business_rules.md §7). La categoría incluye
 * sus subcategorías. Un almacén o categoría inexistente responde 404 en vez de una lista vacía.
 * Devuelve el formato de sendPaginated con summary: productos por estado en el alcance filtrado.
 */
export const listStock = async (query) => {
  const { page, limit, search, warehouseId, categoryId, alert, groupBy } = query;
  if (warehouseId) await getWarehouse(warehouseId);
  const categoryIds = categoryId ? await getSubtreeIds(categoryId) : undefined;
  const { items, total, summary } = await stockRepository.listStock({ groupBy, page, limit, search, warehouseId, categoryIds, status: alert });
  return {
    items: items.map((row) => toStockRowDto(row, { groupBy })),
    total,
    page,
    limit,
    search: search ?? null,
    filters: Object.fromEntries(Object.entries({ warehouseId, categoryId, alert, groupBy }).filter(([, v]) => v !== undefined)),
    sort: { field: 'productCode', order: 'asc' },
    summary: toStockSummaryDto(summary),
  };
};
