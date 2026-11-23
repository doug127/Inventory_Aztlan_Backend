import { z } from 'zod';

export const MovementSchema = z.object({
    movement_type_id: z.number(),
    reason_id: z.number(),
    warehouse_from_id: z.number().nullable(),
    warehouse_to_id: z.number().nullable(),
    reference: z.string().max(255),
    datetime: z.string().refine((value) => !isNaN(Date.parse(value)), {
        message: 'La fecha y hora del movimiento no es válida'
    }),
    note: z.string().max(500).nullable(),
    created_by_user_id: z.number(),
    lines: z.array(z.object({
        product_id: z.number(),
        quantity: z.number().positive()
    })),
    targets: z.array(z.object({
        asset_id: z.number(),
    })).nullable()
});

export class MovementDto {
    constructor({
        reference, 
        datetime, 
        note, 
        created_by_user_id,
    }){
        this.reference = reference;
        this.datetime = datetime;
        this.note = note;
        this.created_by_user_id = created_by_user_id;
    }

    validate() {
        if (!this.reference) throw new Error('La referencia del movimiento es obligatoria');
        
        if(this.reference.length > 255) throw new Error('La referencia del movimiento no puede exceder los 255 caracteres');

        if (!this.datetime) throw new Error('La fecha y hora del movimiento son obligatorias');

        if(isNaN(Date.parse(this.datetime))) throw new Error('La fecha y hora del movimiento no es válida');

        if (!this.created_by_user_id) throw new Error('El ID del usuario que crea el movimiento es obligatorio');

        if (this.note && this.note.length > 500) {
            throw new Error('La nota del movimiento no puede exceder los 500 caracteres');
        }
    }
}