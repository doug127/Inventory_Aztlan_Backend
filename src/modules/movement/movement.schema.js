import { z } from 'zod';
import { MOVEMENT_REASONS } from '#src/shared/constants/movements.js';

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

export const CreateEntrySchema = z
  .object({
    warehouseId: idField('warehouseId'),
    reason: z.enum(Object.values(MOVEMENT_REASONS), { error: 'Motivo desconocido' }),
    movementDate: movementDateField,
    reference: entryReferenceField,
    // Quien entrega físicamente (chofer del proveedor). Opcional.
    receivedBy: optionalText('Entregado por', 150),
    note: optionalText('La observación', 1000),
    lines: z.array(LineSchema, { error: 'lines debe ser una lista' }).max(100, 'Una entrada admite hasta 100 líneas'),
  })
  .strict();

export const MovementIdParamsSchema = z.object({
  id: z.coerce.number({ error: 'El id debe ser un número' }).int('El id debe ser un entero').positive('El id debe ser positivo'),
});

/** Cabecera opcional Idempotency-Key (UUID): reintentos seguros desde campo y desde el asistente. */
export const IdempotencyHeadersSchema = z.looseObject({
  'idempotency-key': z.uuid({ error: 'Idempotency-Key debe ser un UUID' }).optional(),
});
