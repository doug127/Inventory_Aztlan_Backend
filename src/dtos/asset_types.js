export class assetTypesDTO {
    constructor({
        name,
        description
    }){
        this.name = name,
        this.description = description
    }

    validate() {
        if (!this.name) {
            throw new Error("El campo 'name' es obligatorio");
        }

        if (typeof this.name !== "string") {
            throw new Error("El campo 'name' debe ser un texto");
        }

        const name = this.name.trim();

        if (name.length === 0) {
            throw new Error("El campo 'name' no puede estar vacío");
        }

        if (name.length > 20) {
            throw new Error("El campo 'name' no puede superar 20 caracteres");
        }

        const description = this.description ? this.description.trim() : "";

        if (description.length > 50) {
            throw new Error("El campo descripción no puede superar 50 caracteres");
        }

        return {
            name,
            description
        };
    }
}