import Decimal from 'decimal.js';
import { z } from 'zod';
import { RECEIPT_DOCUMENT_PREFIXES } from '#src/shared/constants/movements.js';

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

/** Documento de recepción (factura, vale, recibo…). `file` es null mientras no se adjunte el archivo. */
export const MovementDocumentDto = z.object({
  id: z.number().int(),
  documentType: z.string(),
  documentNumber: z.string(),
  // Prefijo del tipo + número, como en la referencia de la entrada: FAC-0012345.
  label: z.string(),
  supplierName: z.string().nullable(),
  supplierTaxId: z.string().nullable(),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  totalAmount: z.string().regex(/^\d+\.\d{2}$/).nullable(),
  currency: z.string().nullable(),
  file: z
    .object({
      name: z.string(),
      mimeType: z.string(),
      sizeBytes: z.number().int(),
      sha256: z.string(),
      uploadedAt: z.date(),
      uploadedBy: z.object({ id: z.number().int(), fullName: z.string() }),
    })
    .nullable(),
  createdAt: z.date(),
});

export const toMovementDocumentDto = (doc) =>
  MovementDocumentDto.parse({
    id: doc.id,
    documentType: doc.documentType,
    documentNumber: doc.documentNumber,
    label: `${RECEIPT_DOCUMENT_PREFIXES[doc.documentType] ?? doc.documentType}-${doc.documentNumber}`,
    supplierName: doc.supplierName ?? null,
    supplierTaxId: doc.supplierTaxId ?? null,
    issueDate: doc.issueDate ?? null,
    totalAmount: doc.totalAmount === null || doc.totalAmount === undefined ? null : new Decimal(doc.totalAmount).toFixed(2),
    currency: doc.currency ?? null,
    file: doc.fileStorageKey
      ? {
          name: doc.fileOriginalName,
          mimeType: doc.fileMimeType,
          sizeBytes: doc.fileSizeBytes,
          sha256: doc.fileSha256,
          uploadedAt: new Date(doc.fileUploadedAt),
          uploadedBy: { id: doc.fileUploadedBy.id, fullName: doc.fileUploadedBy.fullName },
        }
      : null,
    createdAt: new Date(doc.createdAt),
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
  // Documentos de recepción (solo en entradas; vacío en el resto).
  documents: z.array(MovementDocumentDto),
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
    documents: (movement.documents ?? []).map(toMovementDocumentDto),
    totals: [...totals.values()].map((t) => ({ product: t.product, quantity: fromThousandths(t.thousandths), lines: t.lines })),
  });
};
