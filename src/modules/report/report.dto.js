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

// --- Movimientos por período (HU-502) ------------------------------------------------------------

const MovementSums = {
  entries: Quantity,
  exits: Quantity,
  transfersIn: Quantity,
  transfersOut: Quantity,
  adjustmentsIn: Quantity,
  adjustmentsOut: Quantity,
  net: Quantity,
  documents: z.number().int(),
  lines: z.number().int(),
};

/**
 * Fila del reporte de movimientos (HU-502): un producto con lo que entró (IN), salió (OUT), se trasladó
 * (entrada y salida de traslados) y se ajustó (sobrante y faltante) en el período, y el neto = la
 * variación de su existencia en el alcance. Sin almacén, un traslado entra y sale: su neto es 0.
 */
export const MovementsRowDto = z.object({ product: Product, ...MovementSums, lastMovementAt: z.date().nullable() });

const MOVEMENT_QUANTITY_FIELDS = ['entries', 'exits', 'transfersIn', 'transfersOut', 'adjustmentsIn', 'adjustmentsOut', 'net'];

export const toMovementsRowDto = (row) =>
  MovementsRowDto.parse({
    product: row.product,
    ...Object.fromEntries(MOVEMENT_QUANTITY_FIELDS.map((field) => [field, q3(row[field])])),
    documents: row.documents,
    lines: row.lines,
    lastMovementAt: toDate(row.lastMovementAt),
  });

const TypeCounts = { IN: z.number().int(), OUT: z.number().int(), TRANSFER: z.number().int(), ADJUST: z.number().int() };

/**
 * Resumen de todo el alcance (no depende de la página): documentos, líneas y productos; conteo por tipo
 * y motivo (con cuántos son correcciones REV-); y la serie por período (inicio del día, semana o mes
 * 'AAAA-MM-DD') con los documentos de cada tipo.
 */
export const MovementsSummaryDto = z.object({
  documents: z.number().int(),
  lines: z.number().int(),
  products: z.number().int(),
  byType: z.object(TypeCounts),
  byReason: z.array(z.object({ movementType: z.string(), reason: z.string(), documents: z.number().int(), lines: z.number().int(), corrections: z.number().int() })),
  interval: z.string(),
  byPeriod: z.array(z.object({ period: z.string(), ...TypeCounts, documents: z.number().int() })),
  warehouse: z.object(Ref).nullable(),
});

export const toMovementsSummaryDto = ({ totals, byReason, interval, byPeriod, warehouse }) =>
  MovementsSummaryDto.parse({
    ...totals,
    byType: Object.fromEntries(['IN', 'OUT', 'TRANSFER', 'ADJUST'].map((type) => [type, byReason.filter((r) => r.movementType === type).reduce((n, r) => n + r.documents, 0)])),
    byReason,
    interval,
    byPeriod,
    warehouse: warehouse ? { id: warehouse.id, code: warehouse.code, name: warehouse.name } : null,
  });
