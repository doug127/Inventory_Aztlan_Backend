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
