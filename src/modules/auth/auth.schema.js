import { z } from 'zod';

// El login solo exige que los campos vengan. La política de contraseñas (business_rules.md §9.2)
// se valida al crear o cambiar la contraseña, nunca al iniciar sesión: hacerlo aquí rechazaría
// contraseñas válidas y le diría a un atacante qué formato buscar.
export const LoginSchema = z.object({
  // Acepta el username o el correo (la pantalla de login pide el correo).
  username: z
    .string({ error: 'El usuario o correo es obligatorio' })
    .trim()
    .min(1, 'El usuario o correo es obligatorio')
    .max(150, 'El usuario o correo es demasiado largo')
    .transform((value) => value.toLowerCase()),
  password: z
    .string({ error: 'La contraseña es obligatoria' })
    .min(1, 'La contraseña es obligatoria')
    .max(128, 'La contraseña es demasiado larga'),
  // "Mantener sesión": con false, la cookie del refresh token se borra al cerrar el navegador.
  remember: z.boolean({ error: 'remember debe ser true o false' }).optional().default(true),
}).strict();

// refresh_tokens.id es BIGINT: llega y sale como string de dígitos.
export const SessionIdParamsSchema = z.object({
  id: z.string().regex(/^[1-9]\d{0,18}$/, 'El id de la sesión no es válido'),
});

export const ForgotPasswordSchema = z.object({
  email: z
    .string({ error: 'El correo es obligatorio' })
    .trim()
    .toLowerCase()
    .max(150, 'El correo es demasiado largo')
    .email('El correo no tiene un formato válido'),
}).strict();

// Token opaco de 32 bytes en base64url (43 caracteres). El rango deja margen sin aceptar basura.
const resetTokenField = z
  .string({ error: 'El token es obligatorio' })
  .trim()
  .min(20, 'El token no es válido')
  .max(200, 'El token no es válido');

export const ResetTokenQuerySchema = z.object({ token: resetTokenField });

export const ResetPasswordSchema = z.object({
  token: resetTokenField,
  newPassword: z
    .string({ error: 'La contraseña nueva es obligatoria' })
    .min(1, 'La contraseña nueva es obligatoria')
    .max(128, 'La contraseña es demasiado larga'),
}).strict();

// La política de la contraseña nueva la valida el service, para responder AUTH_WEAK_PASSWORD
// (código del catálogo) en lugar de un VALIDATION_ERROR genérico.
export const ChangePasswordSchema = z.object({
  currentPassword: z
    .string({ error: 'La contraseña actual es obligatoria' })
    .min(1, 'La contraseña actual es obligatoria')
    .max(128, 'La contraseña es demasiado larga'),
  newPassword: z
    .string({ error: 'La contraseña nueva es obligatoria' })
    .min(1, 'La contraseña nueva es obligatoria')
    .max(128, 'La contraseña es demasiado larga'),
}).strict();
