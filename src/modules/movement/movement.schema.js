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