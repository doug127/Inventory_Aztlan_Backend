export class ProductDTO {
    constructor({ name, code, content_quantity, min_stock, max_stock, unit_id, product_category_id }) {
        this.name = name;
        this.code = code;
        this.content_quantity = content_quantity;
        this.min_stock = min_stock;
        this.max_stock = max_stock;
        this.unit_id = unit_id;
        this.product_category_id = product_category_id;
    }

    validate() {
        if(!this.name) throw new Error('El nombre del producto es requerido');
        if(this.name.length > 50) throw new Error('El nombre del producto no puede exceder los 50 caracteres');
        if(this.name.length < 3) throw new Error('El nombre del producto debe tener al menos 3 caracteres');
        
        if(!this.code) throw new Error('El código del producto es requerido');
        if(this.code.length > 20) throw new Error('El código del producto no puede exceder los 20 caracteres');
        if(this.code.length < 3) throw new Error('El código del producto debe tener al menos 3 caracteres');
        if(this.code.includes(' ')) throw new Error('El código del producto no puede contener espacios');
        
        if(this.content_quantity === undefined || this.content_quantity === null) {
            throw new Error('La cantidad de contenido es requerida');
        }
        if(isNaN(this.content_quantity) || this.content_quantity <= 0) {
            throw new Error('La cantidad de contenido debe ser un número positivo');
        }
        
        if(this.min_stock === undefined || this.min_stock === null) {
            throw new Error('El stock mínimo es requerido');
        }
        if(isNaN(this.min_stock) || this.min_stock < 0) {
            throw new Error('El stock mínimo debe ser un número no negativo');
        }

        if(this.max_stock === undefined || this.max_stock === null) {
            throw new Error('El stock máximo es requerido');
        }
        if(isNaN(this.max_stock) || this.max_stock < 0) {
            throw new Error('El stock máximo debe ser un número no negativo');
        }

        if(this.min_stock >= this.max_stock) {
            throw new Error('El stock mínimo no puede ser mayor o igual al stock máximo');
        }

        if(!this.unit_id) throw new Error('El ID de la unidad es requerido');
        if(isNaN(this.unit_id) || this.unit_id <= 0) {
            throw new Error('El ID de la unidad debe ser un número positivo');
        }

        if(this.product_category_id === undefined || this.product_category_id === null){
             throw new Error('El ID de la categoría del producto es requerido');
        }
        if(isNaN(this.product_category_id) || this.product_category_id <= 0) {
            throw new Error('El ID de la categoría del producto debe ser un número positivo');
        }
    }
}
