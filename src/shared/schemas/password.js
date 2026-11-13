import { z } from 'zod';

// Política de contraseñas (business_rules.md §9.2.1): mínimo 8 caracteres, con al menos una
// mayúscula, una minúscula y un número. Se aplica al crear o cambiar una contraseña, nunca al
// iniciar sesión.
export const PasswordSchema = z
  .string({ error: 'La contraseña es obligatoria' })
  .min(8, 'La contraseña debe tener al menos 8 caracteres')
  .max(128, 'La contraseña no debe superar los 128 caracteres')
  .regex(/[A-Z]/, 'La contraseña debe tener al menos una letra mayúscula')
  .regex(/[a-z]/, 'La contraseña debe tener al menos una letra minúscula')
  .regex(/[0-9]/, 'La contraseña debe tener al menos un número');

/** Devuelve la lista de reglas que incumple la contraseña (vacía si cumple). */
export const passwordPolicyIssues = (password) => {
  const result = PasswordSchema.safeParse(password ?? '');
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
};
