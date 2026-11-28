import { z } from 'zod';
import {
  ADJUSTMENT_KINDS,
  MAX_RECEIPT_DOCUMENTS,
  MOVEMENT_REASONS,
  RECEIPT_DOCUMENT_PREFIXES,
  RECEIPT_DOCUMENT_TYPES,
  RECEIPT_FILE_MIME_TYPES,
} from '#src/shared/constants/movements.js';

// Entrada de los movimientos (business_rules.md §2 y §3). Las reglas que dependen del motivo, del
// rol o de la base de datos (activo obligatorio, fechas, existencia) las valida el service.

const idField = (name) => z.number({ error: `${name} debe ser un número` }).int(`${name} debe ser un entero`).positive(`${name} debe ser positivo`);

/** Texto opcional: se recorta y se colapsan los espacios; vacío u omitido queda en null. */
const optionalText = (name, max) =>
  z
    .string({ error: `${name} debe ser texto` })
    .trim()
    .max(max, `${name} no debe superar los ${max} caracteres`)
    .transform((value) => value.replace(/\s+/g, ' ') || null)
    .nullable()
    .optional()
    .transform((value) => value ?? null);

/** NUMERIC(14,3): hasta 11 enteros y 3 decimales, mayor que 0. Se acepta número o texto ("200.5"). */
export const quantityField = z
  .union([z.number(), z.string().trim()], { error: 'La cantidad es obligatoria' })
  .transform((value) => String(value).replace(',', '.'))
  .refine((value) => /^\d{1,11}(\.\d{1,3})?$/.test(value), { error: 'La cantidad admite hasta 11 enteros y 3 decimales' })
  .refine((value) => Number(value) > 0, { error: 'La cantidad debe ser mayor que 0' });

const LineSchema = z
  .object({
    productId: idField('productId'),
    quantity: quantityField,
    assetId: idField('assetId')
      .nullable()
      .optional()
      .transform((v) => v ?? null),
    note: optionalText('La observación de la línea', 500),
  })
  .strict();

/**
 * Orden de trabajo del taller (naming_conventions.md §8.2): OT- seguido de letras, números o guiones.
 * Se acepta con o sin el prefijo y en minúsculas: "2026-0153" y "ot-2026-0153" quedan OT-2026-0153.
 */
export const WORK_ORDER_PATTERN = /^OT-[A-Z0-9][A-Z0-9-]{0,26}$/;
const workOrderField = z
  .string({ error: 'La orden de trabajo debe ser texto' })
  .trim()
  .toUpperCase()
  .transform((value) => value.replace(/\s+/g, ''))
  .transform((value) => (value && !value.startsWith('OT-') ? `OT-${value.replace(/^OT/, '')}` : value))
  .refine((value) => value === '' || WORK_ORDER_PATTERN.test(value), { error: 'La orden de trabajo es OT- seguido de letras, números o guiones (ej. OT-2026-0153)' })
  .transform((value) => value || null)
  .nullable()
  .optional()
  .transform((value) => value ?? null);

/** Fecha y hora ISO 8601 (la interfaz envía la fecha elegida con su hora local). */
const movementDateField = z.iso
  .datetime({ offset: true, error: 'movementDate debe ser una fecha y hora ISO 8601' })
  .transform((value) => new Date(value))
  .optional();

export const CreateWithdrawalSchema = z
  .object({
    warehouseId: idField('warehouseId'),
    reason: z.enum(Object.values(MOVEMENT_REASONS), { error: 'Motivo desconocido' }),
    movementDate: movementDateField,
    // La referencia no se envía: el backend la genera (TALL-2026-000001).
    workOrder: workOrderField,
    receivedBy: optionalText('Recibido por', 150),
    note: optionalText('La observación', 1000),
    // Vacío se rechaza en el service con EMPTY_MOVEMENT (naming_conventions.md §11).
    lines: z.array(LineSchema, { error: 'lines debe ser una lista' }).max(100, 'Una orden admite hasta 100 líneas'),
  })
  .strict();

/**
 * Documento del proveedor (naming_conventions.md §8.2): PREFIJO-número, por ejemplo FAC-0012345,
 * OC-2026-0087, NE-4521 o GD-998. Se guarda en mayúsculas. Recomendada en COMPRA, no obligatoria.
 */
export const ENTRY_REFERENCE_PATTERN = /^[A-Z]{2,4}-[A-Z0-9][A-Z0-9-]{0,40}$/;
const entryReferenceField = z
  .string({ error: 'La referencia debe ser texto' })
  .trim()
  .toUpperCase()
  .transform((value) => value.replace(/\s+/g, ''))
  .refine((value) => value === '' || ENTRY_REFERENCE_PATTERN.test(value), {
    error: 'La referencia es PREFIJO-número: FAC-0012345, OC-2026-0087, NE-4521 o GD-998',
  })
  .transform((value) => value || null)
  .nullable()
  .optional()
  .transform((value) => value ?? null);

/** Texto en mayúsculas sin espacios; vacío u omitido queda en null. */
const upperCode = (name, pattern, message) =>
  z
    .string({ error: `${name} debe ser texto` })
    .trim()
    .toUpperCase()
    .transform((value) => value.replace(/\s+/g, ''))
    .refine((value) => value === '' || pattern.test(value), { error: message })
    .transform((value) => value || null)
    .nullable()
    .optional()
    .transform((value) => value ?? null);

export const RECEIPT_DOCUMENT_NUMBER_PATTERN = /^[A-Z0-9][A-Z0-9-]{0,39}$/;

/**
 * Documento de recepción de una entrada (tabla movement_documents): factura, vale, recibo de compra,
 * nota de entrega, guía de despacho u orden de compra. El número se guarda sin el prefijo del tipo:
 * "FAC-0012345" en una FACTURA queda 0012345 (la referencia de la entrada vuelve a armar FAC-0012345).
 * El archivo escaneado no viaja aquí: se adjunta después con PUT …/documents/:documentId/file.
 */
const ReceiptDocumentSchema = z
  .object({
    documentType: z.enum(Object.values(RECEIPT_DOCUMENT_TYPES), { error: 'Tipo de documento desconocido' }),
    documentNumber: z
      .string({ error: 'Indique el número del documento' })
      .trim()
      .toUpperCase()
      .transform((value) => value.replace(/\s+/g, ''))
      .refine((value) => value !== '', { error: 'Indique el número del documento' }),
    supplierName: optionalText('El proveedor', 150),
    // RIF o NIT del proveedor (J-12345678-9).
    supplierTaxId: upperCode('El RIF o NIT', /^[A-Z0-9][A-Z0-9.-]{2,19}$/, 'El RIF o NIT admite letras, números, puntos y guiones (ej. J-12345678-9)'),
    issueDate: z.iso
      .date({ error: 'La fecha de emisión es AAAA-MM-DD' })
      .nullable()
      .optional()
      .transform((value) => value ?? null),
    // NUMERIC(14,2): hasta 12 enteros y 2 decimales. Se acepta número o texto ("1250,50").
    totalAmount: z
      .union([z.number(), z.string().trim()], { error: 'El monto debe ser un número' })
      .transform((value) => String(value).replace(',', '.'))
      .refine((value) => value === '' || /^\d{1,12}(\.\d{1,2})?$/.test(value), { error: 'El monto admite hasta 12 enteros y 2 decimales, sin signo' })
      .transform((value) => value || null)
      .nullable()
      .optional()
      .transform((value) => value ?? null),
    currency: upperCode('La moneda', /^[A-Z]{3}$/, 'La moneda es un código ISO de 3 letras (USD, VES, EUR)'),
  })
  .strict()
  .transform((doc) => {
    const prefix = `${RECEIPT_DOCUMENT_PREFIXES[doc.documentType]}-`;
    return doc.documentNumber.startsWith(prefix) ? { ...doc, documentNumber: doc.documentNumber.slice(prefix.length) } : doc;
  })
  .refine((doc) => RECEIPT_DOCUMENT_NUMBER_PATTERN.test(doc.documentNumber), {
    error: 'El número del documento admite letras, números y guiones, hasta 40 caracteres',
    path: ['documentNumber'],
  })
  .refine((doc) => !doc.currency || doc.totalAmount, { error: 'Indique el monto o quite la moneda', path: ['currency'] });

export const CreateEntrySchema = z
  .object({
    warehouseId: idField('warehouseId'),
    reason: z.enum(Object.values(MOVEMENT_REASONS), { error: 'Motivo desconocido' }),
    movementDate: movementDateField,
    // Sin referencia y con documentos, el service la arma con el primero (FAC-0012345).
    reference: entryReferenceField,
    documents: z
      .array(ReceiptDocumentSchema, { error: 'documents debe ser una lista' })
      .max(MAX_RECEIPT_DOCUMENTS, `Una entrada admite hasta ${MAX_RECEIPT_DOCUMENTS} documentos`)
      .optional()
      .transform((value) => value ?? []),
    // Quien entrega físicamente (chofer del proveedor). Opcional.
    receivedBy: optionalText('Entregado por', 150),
    note: optionalText('La observación', 1000),
    lines: z.array(LineSchema, { error: 'lines debe ser una lista' }).max(100, 'Una entrada admite hasta 100 líneas'),
  })
  .strict();

/**
 * Traslado entre almacenes (TRANSFER, HU-403, business_rules.md §2.4). El motivo es siempre TRASLADO
 * y no se envía. Origen ≠ destino lo valida el service (INVALID_MOVEMENT_WAREHOUSES).
 */
export const CreateTransferSchema = z
  .object({
    warehouseFromId: idField('warehouseFromId'),
    warehouseToId: idField('warehouseToId'),
    movementDate: movementDateField,
    // Quien lleva físicamente la mercancía (chofer). Opcional.
    receivedBy: optionalText('Trasladado por', 150),
    note: optionalText('La observación', 1000),
    lines: z.array(LineSchema, { error: 'lines debe ser una lista' }).max(100, 'Un traslado admite hasta 100 líneas'),
  })
  .strict();

/**
 * Acta de conteo físico (naming_conventions.md §8.2): CF-AAAA-NNN. Se acepta con o sin el prefijo, en
 * minúsculas y con el correlativo corto: "2026-4", "cf-2026-004" y "CF-2026-004" quedan CF-2026-004.
 */
const physicalCountReferenceField = z
  .string({ error: 'Indique el acta de conteo físico (ej. CF-2026-004)' })
  .trim()
  .toUpperCase()
  .transform((value) => value.replace(/\s+/g, '').replace(/^CF-?/, ''))
  .transform((value, ctx) => {
    const match = /^(\d{4})-(\d{1,6})$/.exec(value);
    if (!match) {
      ctx.addIssue({ code: 'custom', message: 'El acta de conteo es CF-AAAA-NNN (ej. CF-2026-004)' });
      return z.NEVER;
    }
    return `CF-${match[1]}-${match[2].padStart(3, '0')}`;
  });

/**
 * Ajuste por conteo físico (ADJUST, HU-404, business_rules.md §2.5). kind decide el almacén: SOBRANTE
 * suma (warehouse_to_id) y FALTANTE resta (warehouse_from_id). Referencia CF- y observación obligatorias.
 */
export const CreateAdjustmentSchema = z
  .object({
    warehouseId: idField('warehouseId'),
    kind: z.enum(Object.values(ADJUSTMENT_KINDS), { error: 'El tipo de ajuste es SOBRANTE o FALTANTE' }),
    movementDate: movementDateField,
    reference: physicalCountReferenceField,
    note: z
      .string({ error: 'Explique la causa del ajuste' })
      .trim()
      .transform((value) => value.replace(/\s+/g, ' '))
      .pipe(z.string().min(1, 'Explique la causa del ajuste').max(1000, 'La observación no debe superar los 1000 caracteres')),
    lines: z.array(LineSchema, { error: 'lines debe ser una lista' }).max(100, 'Un ajuste admite hasta 100 líneas'),
  })
  .strict();

const optionalQueryId = (name) =>
  z.coerce.number({ error: `${name} debe ser un número` }).int(`${name} debe ser un entero`).positive(`${name} debe ser positivo`).optional();

/** Fecha 'AAAA-MM-DD' de un filtro (sin hora). */
const dayFilter = (name) => z.iso.date({ error: `${name} es una fecha AAAA-MM-DD` }).optional();

/**
 * Historial de movimientos (HU-408, user_flow.md §9). Todos los filtros son opcionales; from y to son
 * inclusive. search busca en el número de documento y en la referencia.
 */
export const ListMovementsQuerySchema = z
  .object({
    page: z.coerce.number().int('page debe ser un entero').min(1, 'page debe ser mayor o igual a 1').default(1),
    limit: z.coerce.number().int('limit debe ser un entero').min(1, 'limit mínimo 1').max(100, 'limit máximo 100').default(10),
    search: z.string().trim().max(60, 'La búsqueda es demasiado larga').optional().transform((v) => v || undefined),
    movementType: z.enum(['IN', 'OUT', 'TRANSFER', 'ADJUST'], { error: 'movementType es IN, OUT, TRANSFER o ADJUST' }).optional(),
    reason: z.enum(Object.values(MOVEMENT_REASONS), { error: 'Motivo desconocido' }).optional(),
    warehouseId: optionalQueryId('warehouseId'),
    from: dayFilter('from'),
    to: dayFilter('to'),
    userId: optionalQueryId('userId'),
    assetId: optionalQueryId('assetId'),
    productId: optionalQueryId('productId'),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, { error: 'La fecha inicial no puede ser posterior a la final', path: ['from'] });

/** Préstamos pendientes (HU-405): por activo, por préstamo (sus pares activo-producto) o por texto. */
export const ListPendingLoansQuerySchema = z.object({
  page: z.coerce.number().int('page debe ser un entero').min(1, 'page debe ser mayor o igual a 1').default(1),
  limit: z.coerce.number().int('limit debe ser un entero').min(1, 'limit mínimo 1').max(100, 'limit máximo 100').default(10),
  search: z.string().trim().max(150, 'La búsqueda es demasiado larga').optional().transform((v) => v || undefined),
  assetId: optionalQueryId('assetId'),
  movementId: optionalQueryId('movementId'),
});

/**
 * Corrección de un movimiento (HU-406): qué líneas del original y cuánto revertir. El tipo y el motivo
 * del inverso los decide el service según el original. La observación (por qué se corrige) es obligatoria.
 */
export const CreateCorrectionSchema = z
  .object({
    movementDate: movementDateField,
    note: z
      .string({ error: 'Explique por qué se corrige' })
      .trim()
      .transform((value) => value.replace(/\s+/g, ' '))
      .pipe(z.string().min(1, 'Explique por qué se corrige').max(1000, 'La observación no debe superar los 1000 caracteres')),
    lines: z
      .array(z.object({ lineId: idField('lineId'), quantity: quantityField }).strict(), { error: 'lines debe ser una lista' })
      .max(100, 'Una corrección admite hasta 100 líneas'),
  })
  .strict();

export const MovementIdParamsSchema = z.object({
  id: z.coerce.number({ error: 'El id debe ser un número' }).int('El id debe ser un entero').positive('El id debe ser positivo'),
});

export const DocumentFileParamsSchema = z.object({
  id: z.coerce.number({ error: 'El id debe ser un número' }).int('El id debe ser un entero').positive('El id debe ser positivo'),
  documentId: z.coerce.number({ error: 'El documentId debe ser un número' }).int('El documentId debe ser un entero').positive('El documentId debe ser positivo'),
});

/**
 * Subida del archivo: el cuerpo es el archivo crudo (no multipart), con su Content-Type y el nombre
 * original en X-File-Name (codificado con encodeURIComponent). El contenido real se verifica en el service.
 */
export const DocumentFileHeadersSchema = z.looseObject({
  'content-type': z
    .string({ error: 'Indique el Content-Type del archivo' })
    .transform((value) => value.split(';')[0].trim().toLowerCase())
    .refine((value) => Object.hasOwn(RECEIPT_FILE_MIME_TYPES, value), { error: 'El archivo debe ser PDF, JPG, PNG o WEBP' }),
  'x-file-name': z
    .string({ error: 'Indique el nombre del archivo en X-File-Name' })
    .transform((value, ctx) => {
      try {
        return decodeURIComponent(value);
      } catch {
        ctx.addIssue({ code: 'custom', message: 'X-File-Name debe ir codificado con encodeURIComponent' });
        return z.NEVER;
      }
    })
    // Solo el nombre, sin carpetas ni caracteres de control.
    .transform((value) => value.split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f]/g, '').trim())
    .refine((value) => value.length >= 1 && value.length <= 255, { error: 'El nombre del archivo debe tener entre 1 y 255 caracteres' }),
});

/** inline (por defecto) abre el archivo en el navegador; attachment lo descarga. */
export const DocumentFileQuerySchema = z.object({
  disposition: z.enum(['inline', 'attachment'], { error: 'disposition es inline o attachment' }).default('inline'),
});

/** Cabecera opcional Idempotency-Key (UUID): reintentos seguros desde campo y desde el asistente. */
export const IdempotencyHeadersSchema = z.looseObject({
  'idempotency-key': z.uuid({ error: 'Idempotency-Key debe ser un UUID' }).optional(),
});
