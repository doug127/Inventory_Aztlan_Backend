import { z } from 'zod';
import { ASSET_LINE_KINDS } from '#src/shared/constants/movements.js';
import { periodFields, periodIsOrdered } from '#src/shared/schemas/dates.js';

// Entrada de activos (HU-302). El formato del código (T-01, TB-100, PE-TAL) lo valida el service,
// para responder con INVALID_CODE_FORMAT del catálogo de errores.

const codeField = z
  .string({ error: 'El código debe ser texto' })
  .trim()
  .toUpperCase()
  .max(20, 'El código debe tener el formato PREFIJO-IDENTIFICADOR (ej. T-01)');

const nameField = z
  .string({ error: 'El nombre es obligatorio' })
  .trim()
  .min(2, 'El nombre debe tener al menos 2 caracteres')
  .max(100, 'El nombre no debe superar los 100 caracteres')
  .transform((value) => value.replace(/\s+/g, ' '));

const idField = (name) =>
  z.number({ error: `${name} es obligatorio y debe ser un número` }).int(`${name} debe ser un entero`).positive(`${name} debe ser positivo`);

export const AssetIdParamsSchema = z.object({
  id: z.coerce.number({ error: 'El id debe ser un número' }).int('El id debe ser un entero').positive('El id debe ser positivo'),
});

/** Sin código, el sistema asigna el siguiente correlativo del prefijo de la categoría (T-03). */
export const CreateAssetSchema = z
  .object({
    code: codeField.optional().transform((v) => v || undefined),
    name: nameField,
    categoryId: idField('categoryId'),
  })
  .strict();

export const UpdateAssetSchema = z
  .object({
    code: codeField.optional(),
    name: nameField.optional(),
    categoryId: idField('categoryId').optional(),
  })
  .strict()
  .refine((body) => Object.values(body).some((v) => v !== undefined), {
    error: 'Indique al menos un campo para modificar (code, name o categoryId)',
  });

const booleanQuery = (name) =>
  z
    .enum(['true', 'false'], { error: `${name} debe ser true o false` })
    .transform((value) => value === 'true')
    .optional();

export const ASSET_SORT_FIELDS = ['code', 'name', 'createdAt'];

export const ListAssetsQuerySchema = z.object({
  page: z.coerce.number().int('page debe ser un entero').min(1, 'page debe ser mayor o igual a 1').default(1),
  limit: z.coerce.number().int('limit debe ser un entero').min(1, 'limit mínimo 1').max(100, 'limit máximo 100').default(20),
  search: z.string().trim().max(100, 'La búsqueda es demasiado larga').optional().transform((v) => v || undefined),
  isActive: booleanQuery('isActive'),
  // Incluye las subcategorías: VEHICULOS trae tractores, retroexcavadoras, camiones…
  categoryId: z.coerce.number().int('categoryId debe ser un entero').positive('categoryId debe ser positivo').optional(),
  sort: z.enum(ASSET_SORT_FIELDS, { error: `sort debe ser uno de: ${ASSET_SORT_FIELDS.join(', ')}` }).default('code'),
  order: z.enum(['asc', 'desc'], { error: 'order debe ser asc o desc' }).default('asc'),
});

/** Grupos por categoría hoja: los mismos filtros de la lista, ordenados por la ruta de la categoría. */
export const ListAssetGroupsQuerySchema = ListAssetsQuerySchema.pick({ page: true, search: true, isActive: true, categoryId: true }).extend({
  limit: z.coerce.number().int('limit debe ser un entero').min(1, 'limit mínimo 1').max(100, 'limit máximo 100').default(50),
});

export const NextAssetCodeQuerySchema = z.object({
  categoryId: z.coerce.number({ error: 'categoryId es obligatorio' }).int('categoryId debe ser un entero').positive('categoryId debe ser positivo'),
});

// --- Ficha del activo (HU-304) -----------------------------------------------------

/** Período del consumo: from y to como AAAA-MM-DD (to incluye ese día). Sin ellos, todo el historial. */
export const AssetConsumptionQuerySchema = z.object(periodFields).refine(...periodIsOrdered);

const KIND_VALUES = Object.values(ASSET_LINE_KINDS);

export const AssetHistoryQuerySchema = z
  .object({
    page: z.coerce.number().int('page debe ser un entero').min(1, 'page debe ser mayor o igual a 1').default(1),
    limit: z.coerce.number().int('limit debe ser un entero').min(1, 'limit mínimo 1').max(100, 'limit máximo 100').default(20),
    ...periodFields,
    productId: z.coerce.number().int('productId debe ser un entero').positive('productId debe ser positivo').optional(),
    // Una o varias clases separadas por coma: kind=CONSUMO,CORRECCION
    kind: z
      .string()
      .trim()
      .toUpperCase()
      .transform((value) => [...new Set(value.split(',').map((k) => k.trim()).filter(Boolean))])
      .refine((kinds) => kinds.length > 0 && kinds.every((k) => KIND_VALUES.includes(k)), {
        error: `kind debe ser uno o varios de: ${KIND_VALUES.join(', ')}`,
      })
      .optional(),
  })
  .refine(...periodIsOrdered);
