import { z } from 'zod';
import { CATEGORY_ICONS } from '#src/shared/constants/icons.js';

// Entrada de categorías de activos (HU-301). El formato del código (LINEA_AMARILLA) lo valida el
// service, para responder con INVALID_CODE_FORMAT del catálogo de errores.

const codeField = z
  .string({ error: 'El código es obligatorio' })
  .trim()
  .toUpperCase()
  .min(1, 'El código es obligatorio')
  .max(20, 'El código no debe superar los 20 caracteres');

const nameField = z
  .string({ error: 'El nombre es obligatorio' })
  .trim()
  .min(2, 'El nombre debe tener al menos 2 caracteres')
  .max(100, 'El nombre no debe superar los 100 caracteres')
  .transform((value) => value.replace(/\s+/g, ' '));

// Icono de lucide del catálogo. Solo para categorías raíz (lo valida el service); null lo quita.
const iconField = z.enum(CATEGORY_ICONS, { error: 'El icono no está en el catálogo de iconos' }).nullable();

const idField = (name) =>
  z.number({ error: `${name} debe ser un número o null` }).int(`${name} debe ser un entero`).positive(`${name} debe ser positivo`);

export const AssetCategoryIdParamsSchema = z.object({
  id: z.coerce.number({ error: 'El id debe ser un número' }).int('El id debe ser un entero').positive('El id debe ser positivo'),
});

/** parentId null u omitido = categoría raíz. */
export const CreateAssetCategorySchema = z
  .object({
    code: codeField,
    name: nameField,
    parentId: idField('parentId').nullable().optional().default(null),
    icon: iconField.optional().default(null),
  })
  .strict();

/** Cambiar parentId mueve la categoría (con todas sus subcategorías y activos) a otro lugar del árbol. */
export const UpdateAssetCategorySchema = z
  .object({
    code: codeField.optional(),
    name: nameField.optional(),
    parentId: idField('parentId').nullable().optional(),
    icon: iconField.optional(),
  })
  .strict()
  .refine((body) => Object.values(body).some((v) => v !== undefined), {
    error: 'Indique al menos un campo para modificar (code, name, parentId o icon)',
  });

const booleanQuery = (name) =>
  z
    .enum(['true', 'false'], { error: `${name} debe ser true o false` })
    .transform((value) => value === 'true')
    .optional();

export const ASSET_CATEGORY_SORT_FIELDS = ['code', 'name', 'createdAt'];

export const ListAssetCategoriesQuerySchema = z
  .object({
    page: z.coerce.number().int('page debe ser un entero').min(1, 'page debe ser mayor o igual a 1').default(1),
    limit: z.coerce.number().int('limit debe ser un entero').min(1, 'limit mínimo 1').max(100, 'limit máximo 100').default(50),
    search: z.string().trim().max(100, 'La búsqueda es demasiado larga').optional().transform((v) => v || undefined),
    isActive: booleanQuery('isActive'),
    parentId: z.coerce.number().int('parentId debe ser un entero').positive('parentId debe ser positivo').optional(),
    root: booleanQuery('root'),
    // leaf=true: solo las que pueden recibir activos (para el formulario de activos, HU-302).
    leaf: booleanQuery('leaf'),
    sort: z.enum(ASSET_CATEGORY_SORT_FIELDS, { error: `sort debe ser uno de: ${ASSET_CATEGORY_SORT_FIELDS.join(', ')}` }).default('name'),
    order: z.enum(['asc', 'desc'], { error: 'order debe ser asc o desc' }).default('asc'),
  })
  .refine((q) => !(q.root && q.parentId), { error: 'Use root=true o parentId, no ambos', path: ['root'] });

/** HU-303. categoryId (la UI) o code (el asistente); sin ninguno, el resumen por raíz. */
export const AssetCountQuerySchema = z
  .object({
    categoryId: z.coerce.number().int('categoryId debe ser un entero').positive('categoryId debe ser positivo').optional(),
    code: codeField.optional(),
  })
  .refine((q) => !(q.categoryId !== undefined && q.code !== undefined), { error: 'Use categoryId o code, no ambos', path: ['code'] });

export const AssetCategoryTreeQuerySchema = z.object({
  // Con isActive=true el árbol omite las ramas inactivas (para los selectores).
  isActive: booleanQuery('isActive'),
});
