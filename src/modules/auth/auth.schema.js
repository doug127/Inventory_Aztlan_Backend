import { z } from 'zod';

export const loginSchema = z.object({
    username: z.string()
        .nonempty('El nombre de usuario es obligatorio')
        .min(3, 'El nombre de usuario debe tener al menos 3 caracteres')
        .max(30, 'El nombre de usuario no debe exceder los 30 caracteres')
        .refine(val => !val.includes(' '), 'El nombre de usuario no debe contener espacios'),
    password: z.string()
        .nonempty('La contraseña es obligatoria')
        .min(8, 'La contraseña debe tener al menos 8 caracteres')
        .max(30, 'La contraseña no debe exceder los 30 caracteres')
        .refine(val => !val.includes(' '), 'La contraseña no debe contener espacios')
        .refine(val => /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&.,-_])[A-Za-z\d@$!%*?&.,-_]{8,}$/.test(val), 
        'La contraseña debe tener al menos 8 caracteres, una letra mayúscula, una letra minúscula, un número y un carácter especial')
});