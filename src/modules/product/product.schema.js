import { z } from 'zod';

// Entrada de productos (HU-204). El formato del código, su prefijo y min ≤ max los valida el
// service, para responder con los códigos del catálogo de errores.

// Cantidad NUMERIC(14,3): hasta 11 enteros y 3 decimales, sin signo. Número o texto ("12.5"),
// se trabaja como texto para no perder precisión.
export const QUANTITY_PATTERN = /^\d{1,11}(\.\d{1,3})?$/;
const quantityField = (label) =>
  z
    .union([z.number(), z.string().trim()], { error: `${label} debe ser un número` })
    .transform((value) => (typeof value === 'number' ? String(value) : value))
    .refine((value) => QUANTITY_PATTERN.test(value), {
      error: `${label} debe ser un número mayor o igual a 0, con hasta 3 decimales`,
    });

const codeField = z
  .string({ error: 'El código debe ser texto' })
  .trim()
  .toUpperCase()
  .max(30, 'El código debe tener el formato CATE-0001');

const nameField = z
  .string({ error: 'El nombre es obligatorio' })
  .trim()
  .min(2, 'El nombre debe tener al menos 2 caracteres')
  .max(150, 'El nombre no debe superar los 150 caracteres')
  .transform((value) => value.replace(/\s+/g, ' '));

const idField = (name) =>
  z.number({ error: `${name} es obligatorio y debe ser un número` }).int(`${name} debe ser un entero`).positive(`${name} debe ser positivo`);

export const ProductIdParamsSchema = z.object({
  id: z.coerce.number({ error: 'El id debe ser un número' }).int('El id debe ser un entero').positive('El id debe ser positivo'),
});

/** Sin código, el sistema asigna el siguiente de la categoría (LUBR-0003). */
export const CreateProductSchema = z
  .object({
    code: codeField.optional().transform((v) => v || undefined),
    name: nameField,
    categoryId: idField('categoryId'),
    unitId: idField('unitId'),
    minStock: quantityField('El stock mínimo').optional().default('0'),
    maxStock: quantityField('El stock máximo').nullable().optional().default(null),
  })
  .strict();

export const UpdateProductSchema = z
  .object({
    code: codeField.optional(),
    name: nameField.optional(),
    categoryId: idField('categoryId').optional(),
    unitId: idField('unitId').optional(),
    minStock: quantityField('El stock mínimo').optional(),
    maxStock: quantityField('El stock máximo').nullable().optional(),
  })
  .strict()
  .refine((body) => Object.values(body).some((v) => v !== undefined), {
    error: 'Indique al menos un campo para modificar (code, name, categoryId, unitId, minStock o maxStock)',
  });

const booleanQuery = (name) =>
  z
    .enum(['true', 'false'], { error: `${name} debe ser true o false` })
    .transform((value) => value === 'true')
    .optional();

const optionalId = (name) => z.coerce.number().int(`${name} debe ser un entero`).positive(`${name} debe ser positivo`).optional();

export const PRODUCT_SORT_FIELDS = ['code', 'name', 'createdAt'];

export const ListProductsQuerySchema = z.object({
  page: z.coerce.number().int('page debe ser un entero').min(1, 'page debe ser mayor o igual a 1').default(1),
  limit: z.coerce.number().int('limit debe ser un entero').min(1, 'limit mínimo 1').max(100, 'limit máximo 100').default(20),
  search: z.string().trim().max(150, 'La búsqueda es demasiado larga').optional().transform((v) => v || undefined),
  isActive: booleanQuery('isActive'),
  // Incluye las subcategorías (user_flow.md §4).
  categoryId: optionalId('categoryId'),
  unitId: optionalId('unitId'),
  sort: z.enum(PRODUCT_SORT_FIELDS, { error: `sort debe ser uno de: ${PRODUCT_SORT_FIELDS.join(', ')}` }).default('code'),
  order: z.enum(['asc', 'desc'], { error: 'order debe ser asc o desc' }).default('asc'),
});

export const NextCodeQuerySchema = z.object({
  categoryId: z.coerce.number({ error: 'categoryId es obligatorio' }).int('categoryId debe ser un entero').positive('categoryId debe ser positivo'),
});
