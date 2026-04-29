export class ReasonsDTO {

    constructor({ type }) {
        this.type = type;
    }

    validate() {

        if (!this.type) {
            throw new Error("El campo 'type' es obligatorio");
        }

        if (typeof this.type !== "string") {
            throw new Error("El campo 'type' debe ser un texto");
        }

        const type = this.type.trim();

        if (type.length === 0) {
            throw new Error("El campo 'type' no puede estar vacío");
        }

        if (type.length > 100) {
            throw new Error("El campo 'type' no puede superar 100 caracteres");
        }

        return {
            type
        };
    }
}