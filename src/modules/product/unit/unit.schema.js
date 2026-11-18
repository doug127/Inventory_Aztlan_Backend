import { z } from 'zod';

// Entrada de unidades (HU-202). El formato del código (1 a 10 letras) y las reglas de la unidad
// base y el factor las valida el service, para responder con los códigos del catálogo.

const codeField = z
  .string({ error: 'El código es obligatorio' })
  .trim()
  .toUpperCase()
  .min(1, 'El código es obligatorio')
  .max(20, 'El código debe tener de 1 a 10 letras');

const nameField = z
  .string({ error: 'El nombre es obligatorio' })
  .trim()
  .min(2, 'El nombre debe tener al menos 2 caracteres')
  .max(50, 'El nombre no debe superar los 50 caracteres')
  .transform((value) => value.replace(/\s+/g, ' '));

// Número positivo con hasta 6 decimales (NUMERIC(18,6)). Se acepta número o texto ("3.785411")
// y se trabaja como texto para no perder precisión.
export const DECIMAL_PATTERN = /^\d{1,12}(\.\d{1,6})?$/;
const factorField = z
  .union([z.number(), z.string().trim()], { error: 'El factor de conversión debe ser un número' })
  .transform((value) => (typeof value === 'number' ? String(value) : value))
  .refine((value) => DECIMAL_PATTERN.test(value), {
    error: 'El factor debe ser un número positivo con hasta 12 enteros y 6 decimales',
  });

const baseUnitIdField = z
  .number({ error: 'baseUnitId debe ser un número o null' })
  .int('baseUnitId debe ser un entero')
  .positive('baseUnitId debe ser positivo')
  .nullable();

export const UnitIdParamsSchema = z.object({
  id: z.coerce.number({ error: 'El id debe ser un número' }).int('El id debe ser un entero').positive('El id debe ser positivo'),
});

/** Unidad base: sin baseUnitId (el factor es 1). Derivada: baseUnitId + conversionFactor. */
export const CreateUnitSchema = z
  .object({
    code: codeField,
    name: nameField,
    baseUnitId: baseUnitIdField.optional().default(null),
    conversionFactor: factorField.optional(),
  })
  .strict();

export const UpdateUnitSchema = z
  .object({
    code: codeField.optional(),
    name: nameField.optional(),
    baseUnitId: baseUnitIdField.optional(),
    conversionFactor: factorField.optional(),
  })
  .strict()
  .refine((body) => Object.values(body).some((v) => v !== undefined), {
    error: 'Indique al menos un campo para modificar (code, name, baseUnitId o conversionFactor)',
  });

const booleanQuery = (name) =>
  z
    .enum(['true', 'false'], { error: `${name} debe ser true o false` })
    .transform((value) => value === 'true')
    .optional();

export const UNIT_SORT_FIELDS = ['code', 'name', 'createdAt'];

export const ListUnitsQuerySchema = z.object({
  page: z.coerce.number().int('page debe ser un entero').min(1, 'page debe ser mayor o igual a 1').default(1),
  limit: z.coerce.number().int('limit debe ser un entero').min(1, 'limit mínimo 1').max(100, 'limit máximo 100').default(50),
  search: z.string().trim().max(50, 'La búsqueda es demasiado larga').optional().transform((v) => v || undefined),
  isActive: booleanQuery('isActive'),
  kind: z.enum(['base', 'derived'], { error: 'kind debe ser base o derived' }).optional(),
  baseUnitId: z.coerce.number().int('baseUnitId debe ser un entero').positive('baseUnitId debe ser positivo').optional(),
  sort: z.enum(UNIT_SORT_FIELDS, { error: `sort debe ser uno de: ${UNIT_SORT_FIELDS.join(', ')}` }).default('code'),
  order: z.enum(['asc', 'desc'], { error: 'order debe ser asc o desc' }).default('asc'),
});

export const ConvertQuerySchema = z.object({
  from: codeField,
  to: codeField,
  quantity: z
    .string({ error: 'La cantidad es obligatoria' })
    .trim()
    .refine((value) => DECIMAL_PATTERN.test(value) && Number(value) > 0, {
      error: 'La cantidad debe ser un número positivo con hasta 6 decimales',
    }),
});
