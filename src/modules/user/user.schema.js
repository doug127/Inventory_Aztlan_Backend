import { z } from 'zod';
import { ROLE_CODES } from '#src/shared/constants/roles.js';

// Entrada de la gestión de usuarios (HU-107, HU-108). Las reglas de jerarquía no van aquí: dependen
// del actor y del usuario destino, así que las valida el service.

const ROLE_CODE_VALUES = Object.values(ROLE_CODES);

// Igual que chk_users_username (db_schema.md §1): empieza con letra, 3 a 50 caracteres.
const usernameField = z
  .string({ error: 'El nombre de usuario es obligatorio' })
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z][a-z0-9._]{2,49}$/,
    'El nombre de usuario debe empezar con una letra y tener de 3 a 50 caracteres (letras, números, punto o guion bajo)'
  );

const emailField = z
  .string({ error: 'El correo es obligatorio' })
  .trim()
  .toLowerCase()
  .max(150, 'El correo es demasiado largo')
  .email('El correo no tiene un formato válido');

const fullNameField = z
  .string({ error: 'El nombre completo es obligatorio' })
  .trim()
  .min(3, 'El nombre completo debe tener al menos 3 caracteres')
  .max(150, 'El nombre completo no debe superar los 150 caracteres')
  .transform((value) => value.replace(/\s+/g, ' '));

const roleCodeField = z
  .string({ error: 'El rol es obligatorio' })
  .trim()
  .toUpperCase()
  .refine((value) => ROLE_CODE_VALUES.includes(value), { error: `El rol debe ser uno de: ${ROLE_CODE_VALUES.join(', ')}` });

export const UserIdParamsSchema = z.object({
  id: z.coerce.number({ error: 'El id debe ser un número' }).int('El id debe ser un entero').positive('El id debe ser positivo'),
});

// No hay campo de contraseña: la temporal la genera el sistema al enviar el correo WELCOME.
export const CreateUserSchema = z
  .object({
    username: usernameField,
    fullName: fullNameField,
    email: emailField,
    roleCode: roleCodeField,
  })
  .strict();

export const UpdateUserSchema = z
  .object({
    username: usernameField.optional(),
    fullName: fullNameField.optional(),
    email: emailField.optional(),
    roleCode: roleCodeField.optional(),
  })
  .strict()
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    error: 'Indique al menos un campo para modificar (username, fullName, email o roleCode)',
  });

const booleanQuery = (name) =>
  z
    .enum(['true', 'false'], { error: `${name} debe ser true o false` })
    .transform((value) => value === 'true')
    .optional();

export const USER_SORT_FIELDS = ['username', 'fullName', 'email', 'role', 'createdAt', 'lastLoginAt'];

export const ListUsersQuerySchema = z.object({
  page: z.coerce.number().int('page debe ser un entero').min(1, 'page debe ser mayor o igual a 1').default(1),
  limit: z.coerce.number().int('limit debe ser un entero').min(1, 'limit mínimo 1').max(100, 'limit máximo 100').default(20),
  search: z.string().trim().max(100, 'La búsqueda es demasiado larga').optional().transform((v) => v || undefined),
  roleCode: roleCodeField.optional(),
  isActive: booleanQuery('isActive'),
  isLocked: booleanQuery('isLocked'),
  sort: z.enum(USER_SORT_FIELDS, { error: `sort debe ser uno de: ${USER_SORT_FIELDS.join(', ')}` }).default('username'),
  order: z.enum(['asc', 'desc'], { error: 'order debe ser asc o desc' }).default('asc'),
});
