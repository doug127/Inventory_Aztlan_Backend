export const validateCategoryProductData = ({ name, description, existingCategory }) => {
    if (!name || name.trim() === '') {
        throw new Error('El nombre de la categoria de producto es obligatorio');
    }
    if (existingCategory) {
        throw new Error('Ya existe una categoria de producto con ese nombre');
    }
    if (description && description.length > 255) {
        throw new Error('La descripcion no puede exceder los 255 caracteres');
    }
}