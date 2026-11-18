import { z } from 'zod';

// Entrada de almacenes (HU-201). El formato del código (4 caracteres A-Z/0-9) lo valida el service
// para responder INVALID_CODE_FORMAT del catálogo en lugar de un VALIDATION_ERROR genérico.

const codeField = z
  .string({ error: 'El código es obligatorio' })
  .trim()
  .toUpperCase()
  .min(1, 'El código es obligatorio')
  .max(10, 'El código debe tener 4 caracteres');

const nameField = z
  .string({ error: 'El nombre es obligatorio' })
  .trim()
  .min(3, 'El nombre debe tener al menos 3 caracteres')
  .max(100, 'El nombre no debe superar los 100 caracteres')
  .transform((value) => value.replace(/\s+/g, ' '));

export const WarehouseIdParamsSchema = z.object({
  id: z.coerce.number({ error: 'El id debe ser un número' }).int('El id debe ser un entero').positive('El id debe ser positivo'),
});

export const CreateWarehouseSchema = z.object({ code: codeField, name: nameField }).strict();

export const UpdateWarehouseSchema = z
  .object({ code: codeField.optional(), name: nameField.optional() })
  .strict()
  .refine((body) => body.code !== undefined || body.name !== undefined, {
    error: 'Indique al menos un campo para modificar (code o name)',
  });

const booleanQuery = (name) =>
  z
    .enum(['true', 'false'], { error: `${name} debe ser true o false` })
    .transform((value) => value === 'true')
    .optional();

export const WAREHOUSE_SORT_FIELDS = ['code', 'name', 'createdAt'];

export const ListWarehousesQuerySchema = z.object({
  page: z.coerce.number().int('page debe ser un entero').min(1, 'page debe ser mayor o igual a 1').default(1),
  limit: z.coerce.number().int('limit debe ser un entero').min(1, 'limit mínimo 1').max(100, 'limit máximo 100').default(50),
  search: z.string().trim().max(100, 'La búsqueda es demasiado larga').optional().transform((v) => v || undefined),
  isActive: booleanQuery('isActive'),
  sort: z.enum(WAREHOUSE_SORT_FIELDS, { error: `sort debe ser uno de: ${WAREHOUSE_SORT_FIELDS.join(', ')}` }).default('code'),
  order: z.enum(['asc', 'desc'], { error: 'order debe ser asc o desc' }).default('asc'),
});
