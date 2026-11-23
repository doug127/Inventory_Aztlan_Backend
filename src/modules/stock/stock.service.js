// Consultas de stock. La consulta completa por almacén y categoría con alertas llega en HU-407;
// por ahora, la existencia por almacén que necesita el formulario de la orden de retiro (HU-401).
import Decimal from 'decimal.js';
import { AppError } from '#src/shared/errors/AppError.js';
import { getWarehouse } from '#src/modules/warehouse/warehouse.service.js';
import * as stockRepository from './stock.repository.js';
import { toAvailabilityDto } from './stock.dto.js';

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
