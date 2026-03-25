export class assetsDTO {
    constructor({ name }){
        this.name = name
    }

    validate() {
        if (this.name === undefined || this.name === null) {
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

        return { name };
    }
}