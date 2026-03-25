export class UnitDTO {
    constructor({ name, code, is_active, base_unit_id, conversion_factor }) {
        this.name = name;
        this.code = code;
        this.is_active = is_active;
        this.base_unit_id = base_unit_id;
        this.conversion_factor = conversion_factor;
    }

    validate() {
        if (!this.name || this.name.length < 3 || this.name.length > 50) {
            throw new Error('El nombre de la unidad debe tener entre 3 y 50 caracteres');
        }
        if (this.name.includes('  ')) {
            throw new Error('El nombre de la unidad no debe contener espacios dobles');
        }
        if (!/^[A-Za-z0-9\s]+$/.test(this.name)) {
            throw new Error('El nombre de la unidad solo debe contener letras, números y espacios');
        }
        if (!this.code || this.code.length < 1 || this.code.length > 4) {  
            throw new Error('El código de la unidad debe tener entre 1 y 4 caracteres');
        }
        if (this.code.includes(' ')) {
            throw new Error('El código de la unidad no debe contener espacios');
        }
        if (typeof this.is_active !== 'boolean') {
            throw new Error('El campo is_active debe ser un booleano');
        }
        if (this.base_unit_id !== null && this.base_unit_id !== undefined) {
            if (typeof this.base_unit_id !== 'number' || this.base_unit_id <= 0) {
                throw new Error('El ID de la unidad base debe ser un número positivo o nulo');
            }
        }
        if (typeof this.conversion_factor !== 'number' || this.conversion_factor <= 0) {
            throw new Error('El factor de conversión debe ser un número positivo');
        }
    }
}
