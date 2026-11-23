import { z } from 'zod';

const CategoryRefDto = z.object({ id: z.number().int(), code: z.string(), name: z.string() });

export const AssetDto = z.object({
  id: z.number().int(),
  code: z.string(),
  name: z.string(),
  category: z.object({
    id: z.number().int(),
    code: z.string(),
    name: z.string(),
    isActive: z.boolean(),
    // De la raíz a la hoja: Vehículos › Maquinaria agrícola › Tractor.
    path: z.array(CategoryRefDto),
    // Icono de la raíz de la rama (las subcategorías no guardan icono propio).
    displayIcon: z.string().nullable(),
  }),
  isActive: z.boolean(),
  // Con movimientos, el código ya no cambia (aparece en órdenes impresas).
  hasMovements: z.boolean(),
  // Productos con préstamo pendiente de devolución: con alguno, no se desactiva.
  pendingLoans: z.number().int(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const toAssetDto = (asset) =>
  AssetDto.parse({
    id: asset.id,
    code: asset.code,
    name: asset.name,
    category: {
      id: asset.category.id,
      code: asset.category.code,
      name: asset.category.name,
      isActive: asset.category.isActive,
      path: asset.categoryPath ?? [],
      displayIcon: asset.rootIcon ?? null,
    },
    isActive: asset.isActive,
    hasMovements: Boolean(asset.hasMovements),
    pendingLoans: Number(asset.pendingLoans ?? 0),
    createdAt: new Date(asset.createdAt),
    updatedAt: new Date(asset.updatedAt),
  });

/**
 * Grupo de activos de una categoría hoja (un lote con sus tablones): cuántos hay con el filtro
 * aplicado, cuántos están en servicio y el rango de códigos (TB-100 … TB-140).
 */
export const AssetGroupDto = z.object({
  category: z.object({
    id: z.number().int(),
    code: z.string(),
    name: z.string(),
    isActive: z.boolean(),
    path: z.array(CategoryRefDto),
    displayIcon: z.string().nullable(),
  }),
  assets: z.number().int(),
  active: z.number().int(),
  firstCode: z.string(),
  lastCode: z.string(),
});

export const toAssetGroupDto = (group) =>
  AssetGroupDto.parse({
    category: {
      id: group.id,
      code: group.code,
      name: group.name,
      isActive: group.isActive,
      path: group.path ?? [],
      displayIcon: group.rootIcon ?? null,
    },
    assets: Number(group.assets),
    active: Number(group.active),
    firstCode: group.firstCode,
    lastCode: group.lastCode,
  });

// --- Ficha del activo (HU-304) ----------------------------------------------------

const Quantity = z.string().regex(/^-?\d+(\.\d+)?$/);
const ProductRefDto = z.object({ id: z.number().int(), code: z.string(), name: z.string(), unitCode: z.string() });

/** Consumo neto por producto en el período: consumido − corregido (business_rules.md §5). */
export const AssetConsumptionDto = z.object({
  asset: AssetDto,
  period: z.object({ from: z.date().nullable(), to: z.date().nullable() }),
  activity: z.object({ lines: z.number().int(), firstMovementAt: z.date().nullable(), lastMovementAt: z.date().nullable() }),
  consumption: z.array(
    z.object({
      product: ProductRefDto,
      consumed: Quantity,
      corrected: Quantity,
      net: Quantity,
      lines: z.number().int(),
      lastConsumedAt: z.date().nullable(),
    })
  ),
  pendingLoans: z.array(z.object({ product: z.object({ code: z.string(), name: z.string(), unitCode: z.string() }), pending: Quantity })),
});

/** Una línea del historial del activo. consumptionEffect: cuánto suma (+) o resta (−) al consumo neto. */
export const AssetHistoryLineDto = z.object({
  id: z.number().int(),
  kind: z.enum(['CONSUMO', 'CORRECCION', 'PRESTAMO', 'DEVOLUCION', 'OTRO']),
  movement: z.object({
    id: z.number().int(),
    documentNumber: z.string(),
    movementType: z.string(),
    reason: z.string(),
    reference: z.string().nullable(),
    movementDate: z.date(),
    receivedBy: z.string().nullable(),
    warehouse: z.object({ id: z.number().int(), code: z.string(), name: z.string() }).nullable(),
    createdBy: z.object({ id: z.number().int(), fullName: z.string() }),
  }),
  product: ProductRefDto,
  quantity: Quantity,
  consumptionEffect: Quantity,
  note: z.string().nullable(),
});

const toDate = (value) => (value ? new Date(value) : null);

export const toAssetConsumptionDto = ({ asset, period, activity, consumption, pendingLoans }) =>
  AssetConsumptionDto.parse({
    asset: toAssetDto(asset),
    period: { from: period.from ?? null, to: period.to ?? null },
    activity: {
      lines: Number(activity?.lines ?? 0),
      firstMovementAt: toDate(activity?.firstMovementAt),
      lastMovementAt: toDate(activity?.lastMovementAt),
    },
    consumption: consumption.map((row) => ({
      product: { id: row.id, code: row.code, name: row.name, unitCode: row.unitCode },
      consumed: row.consumed,
      corrected: row.corrected,
      net: row.net,
      lines: Number(row.lines),
      lastConsumedAt: toDate(row.lastConsumedAt),
    })),
    pendingLoans: pendingLoans.map((loan) => ({ product: { code: loan.code, name: loan.name, unitCode: loan.unitCode }, pending: loan.pending })),
  });

export const toAssetHistoryLineDto = (line) =>
  AssetHistoryLineDto.parse({
    id: line.id,
    kind: line.kind,
    movement: {
      id: line.movementId,
      documentNumber: line.documentNumber,
      movementType: line.movementType,
      reason: line.reason,
      reference: line.reference ?? null,
      movementDate: new Date(line.movementDate),
      receivedBy: line.receivedBy ?? null,
      warehouse: line.warehouse ?? null,
      createdBy: line.createdBy,
    },
    product: line.product,
    quantity: line.quantity,
    consumptionEffect: line.consumptionEffect,
    note: line.lineNote ?? null,
  });
