import Decimal from 'decimal.js';
import { z } from 'zod';

// El neto puede ser negativo: una corrección registrada en el período de un consumo anterior a él.
const Quantity = z.string().regex(/^-?\d+\.\d{3}$/);
const q3 = (value) => new Decimal(value).toFixed(3);

const Ref = { id: z.number().int(), code: z.string(), name: z.string() };
const Product = z.object({ ...Ref, unitCode: z.string() });
const Sums = { consumed: Quantity, corrected: Quantity, net: Quantity, lines: z.number().int(), assets: z.number().int() };

/**
 * Fila del reporte de consumo (HU-501): un activo (groupBy=asset) o una categoría (groupBy=assetCategory)
 * con un producto. consumed (OUT CONSUMO), corrected (correcciones REV- de esos consumos) y net =
 * consumed − corrected (business_rules.md §5). Las cantidades de productos distintos no se suman entre sí.
 */
export const ConsumptionRowDto = z.object({
  asset: z.object({ ...Ref, isActive: z.boolean(), category: z.object(Ref) }).nullable(),
  assetCategory: z.object({ ...Ref, isLeaf: z.boolean() }).nullable(),
  product: Product,
  ...Sums,
  lastConsumedAt: z.date().nullable(),
});

const toDate = (value) => (value ? new Date(value) : null);

export const toConsumptionRowDto = (row) =>
  ConsumptionRowDto.parse({
    asset: row.asset ?? null,
    assetCategory: row.assetCategory ?? null,
    product: row.product,
    consumed: q3(row.consumed),
    corrected: q3(row.corrected),
    net: q3(row.net),
    lines: row.lines,
    assets: row.assets,
    lastConsumedAt: toDate(row.lastConsumedAt),
  });

/** Totales del alcance filtrado, por producto, más cuántos grupos (activos o categorías) y líneas hay. */
export const ConsumptionSummaryDto = z.object({
  groups: z.number().int(),
  lines: z.number().int(),
  products: z.array(z.object({ product: Product, ...Sums })),
  assetCategory: z.object(Ref).nullable(),
});

export const toConsumptionSummaryDto = ({ groups, lines, products, assetCategory }) =>
  ConsumptionSummaryDto.parse({
    groups,
    lines,
    products: products.map((row) => ({
      product: row.product,
      consumed: q3(row.consumed),
      corrected: q3(row.corrected),
      net: q3(row.net),
      lines: row.lines,
      assets: row.assets,
    })),
    assetCategory: assetCategory ? { id: assetCategory.id, code: assetCategory.code, name: assetCategory.name } : null,
  });
