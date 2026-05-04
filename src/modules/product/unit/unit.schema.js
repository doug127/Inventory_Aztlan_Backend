import { z } from 'zod';

export const UnitSchema = z.object({
    name: z.string()
        .min(3, { message: 'El nombre de la unidad debe tener al menos 3 caracteres' })
        .max(50, { message: 'El nombre de la unidad no debe exceder los 50 caracteres' })
        .refine(name => !name.includes('  '), 
            { message: 'El nombre de la unidad no debe contener espacios dobles' })
        .refine(name => /^[A-Za-z0-9\s]+$/.test(name), 
            { message: 'El nombre de la unidad solo debe contener letras, números y espacios' }
        ),
    code: z.string()
        .min(1, { message: 'El código de la unidad debe tener al menos 1 carácter' })
        .max(4, { message: 'El código de la unidad no debe exceder los 4 caracteres' })
        .refine(code => !code.includes(' '), { message: 'El código de la unidad no debe contener espacios' }),
    is_active: z.boolean(),
    base_unit_id: z.number().positive().nullable().optional(),
    conversion_factor: z.number().positive()
});