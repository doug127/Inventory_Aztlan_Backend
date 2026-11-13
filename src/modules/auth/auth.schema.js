import { z } from 'zod';

// El login solo exige que los campos vengan. La política de contraseñas (business_rules.md §9.2)
// se valida al crear o cambiar la contraseña, nunca al iniciar sesión: hacerlo aquí rechazaría
// contraseñas válidas y le diría a un atacante qué formato buscar.
export const LoginSchema = z.object({
  username: z
    .string({ error: 'El nombre de usuario es obligatorio' })
    .trim()
    .min(1, 'El nombre de usuario es obligatorio')
    .max(150, 'El nombre de usuario es demasiado largo')
    .transform((value) => value.toLowerCase()),
  password: z
    .string({ error: 'La contraseña es obligatoria' })
    .min(1, 'La contraseña es obligatoria')
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
