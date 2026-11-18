import { z } from 'zod';

// Entrada de categorías de productos (HU-203). El formato del código (4 letras) lo valida el
// service, para responder con INVALID_CODE_FORMAT del catálogo de errores.

const codeField = z
  .string({ error: 'El código es obligatorio' })
  .trim()
  .toUpperCase()
  .min(1, 'El código es obligatorio')
  .max(20, 'El código debe tener exactamente 4 letras');

const nameField = z
  .string({ error: 'El nombre es obligatorio' })
  .trim()
  .min(2, 'El nombre debe tener al menos 2 caracteres')
  .max(100, 'El nombre no debe superar los 100 caracteres')
  .transform((value) => value.replace(/\s+/g, ' '));

// Texto libre opcional: vacío equivale a "sin descripción" (null).
const descriptionField = z
  .string({ error: 'La descripción debe ser texto' })
  .trim()
  .max(500, 'La descripción no debe superar los 500 caracteres')
  .nullable()
  .transform((value) => value || null);

const idField = (name) =>
  z.number({ error: `${name} debe ser un número o null` }).int(`${name} debe ser un entero`).positive(`${name} debe ser positivo`);

export const CategoryIdParamsSchema = z.object({
  id: z.coerce.number({ error: 'El id debe ser un número' }).int('El id debe ser un entero').positive('El id debe ser positivo'),
});

/** parentId null u omitido = categoría raíz. */
export const CreateCategorySchema = z
  .object({
    code: codeField,
    name: nameField,
    description: descriptionField.optional().default(null),
    parentId: idField('parentId').nullable().optional().default(null),
  })
  .strict();

/** Cambiar parentId mueve la categoría (con todas sus subcategorías) a otro lugar del árbol. */
export const UpdateCategorySchema = z
  .object({
    code: codeField.optional(),
    name: nameField.optional(),
    description: descriptionField.optional(),
    parentId: idField('parentId').nullable().optional(),
  })
  .strict()
  .refine((body) => Object.values(body).some((v) => v !== undefined), {
    error: 'Indique al menos un campo para modificar (code, name, description o parentId)',
  });

const booleanQuery = (name) =>
  z
    .enum(['true', 'false'], { error: `${name} debe ser true o false` })
    .transform((value) => value === 'true')
    .optional();

export const CATEGORY_SORT_FIELDS = ['code', 'name', 'createdAt'];

export const ListCategoriesQuerySchema = z
  .object({
    page: z.coerce.number().int('page debe ser un entero').min(1, 'page debe ser mayor o igual a 1').default(1),
    limit: z.coerce.number().int('limit debe ser un entero').min(1, 'limit mínimo 1').max(100, 'limit máximo 100').default(50),
    search: z.string().trim().max(100, 'La búsqueda es demasiado larga').optional().transform((v) => v || undefined),
    isActive: booleanQuery('isActive'),
    parentId: z.coerce.number().int('parentId debe ser un entero').positive('parentId debe ser positivo').optional(),
    root: booleanQuery('root'),
    sort: z.enum(CATEGORY_SORT_FIELDS, { error: `sort debe ser uno de: ${CATEGORY_SORT_FIELDS.join(', ')}` }).default('name'),
    order: z.enum(['asc', 'desc'], { error: 'order debe ser asc o desc' }).default('asc'),
  })
  .refine((q) => !(q.root && q.parentId), { error: 'Use root=true o parentId, no ambos', path: ['root'] });

export const CategoryTreeQuerySchema = z.object({
  // Con isActive=true el árbol omite las ramas inactivas (para los selectores de productos).
  isActive: booleanQuery('isActive'),
});
