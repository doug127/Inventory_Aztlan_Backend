import { z } from 'zod';

const Quantity = z.string().regex(/^\d+\.\d{3}$/);
const WarehouseRef = z.object({ id: z.number().int(), code: z.string(), name: z.string() });
const ProductRef = z.object({ id: z.number().int(), code: z.string(), name: z.string(), unitCode: z.string() });

export const MovementLineDto = z.object({
  id: z.number().int(),
  product: ProductRef,
  quantity: Quantity,
  asset: z
    .object({
      id: z.number().int(),
      code: z.string(),
      name: z.string(),
      category: z.object({ id: z.number().int(), code: z.string(), name: z.string() }),
    })
    .nullable(),
  note: z.string().nullable(),
});

export const MovementDto = z.object({
  id: z.number().int(),
  documentNumber: z.string(),
  movementType: z.enum(['IN', 'OUT', 'TRANSFER', 'ADJUST']),
  reason: z.string(),
  reference: z.string().nullable(),
  workOrder: z.string().nullable(),
  movementDate: z.date(),
  createdAt: z.date(),
  createdBy: z.object({ id: z.number().int(), fullName: z.string(), username: z.string() }),
  fromWarehouse: WarehouseRef.nullable(),
  toWarehouse: WarehouseRef.nullable(),
  receivedBy: z.string().nullable(),
  note: z.string().nullable(),
  lines: z.array(MovementLineDto),
  // Total por producto sumando sus líneas (resumen de la orden y de la impresión).
  totals: z.array(z.object({ product: ProductRef, quantity: Quantity, lines: z.number().int() })),
});

const toWarehouse = (w) => (w ? { id: w.id, code: w.code, name: w.name } : null);

/** '200.000' → 200000n milésimas; así los totales son exactos sin aritmética de coma flotante. */
const toThousandths = (quantity) => {
  const [int, dec = ''] = quantity.split('.');
  return BigInt(int) * 1000n + BigInt(dec.padEnd(3, '0').slice(0, 3));
};
const fromThousandths = (value) => `${value / 1000n}.${String(value % 1000n).padStart(3, '0')}`;

export const toMovementDto = (movement) => {
  const lines = movement.lines.map((line) => ({
    id: line.id,
    product: { id: line.product.id, code: line.product.code, name: line.product.name, unitCode: line.product.unit.code },
    quantity: fromThousandths(toThousandths(String(line.quantity))),
    asset: line.asset
      ? {
          id: line.asset.id,
          code: line.asset.code,
          name: line.asset.name,
          category: { id: line.asset.category.id, code: line.asset.category.code, name: line.asset.category.name },
        }
      : null,
    note: line.note ?? null,
  }));

  const totals = new Map();
  for (const line of lines) {
    const current = totals.get(line.product.id) ?? { product: line.product, thousandths: 0n, lines: 0 };
    current.thousandths += toThousandths(line.quantity);
    current.lines += 1;
    totals.set(line.product.id, current);
  }

  return MovementDto.parse({
    id: movement.id,
    documentNumber: movement.documentNumber,
    movementType: movement.movementType,
    reason: movement.reason,
    reference: movement.reference ?? null,
    workOrder: movement.workOrder ?? null,
    movementDate: new Date(movement.movementDate),
    createdAt: new Date(movement.createdAt),
    createdBy: { id: movement.createdBy.id, fullName: movement.createdBy.fullName, username: movement.createdBy.username },
    fromWarehouse: toWarehouse(movement.fromWarehouse),
    toWarehouse: toWarehouse(movement.toWarehouse),
    receivedBy: movement.receivedBy ?? null,
    note: movement.note ?? null,
    lines,
    totals: [...totals.values()].map((t) => ({ product: t.product, quantity: fromThousandths(t.thousandths), lines: t.lines })),
  });
};
