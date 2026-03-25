import { 
    getAllCategoryProductsRepository,
    getAllDescendantsRepository,
    getCategoryProductByNameRepository,
    createCategoryProductRepository,
    updateCategoryProductRepository,
    getCategoryProductByIdRepository,
    deleteCategoryProductRepository,
    hasCategoryChildrenRepository,
    // hasProductsInCategoryRepository
} from "../repositories/category_products.js";
import {
    validateCategoryProductData
} from '../dtos/category_products.js';

export const getAllCategoryProducts = async () => {
    const all = await getAllCategoryProductsRepository();
    if (!all || all.length === 0) {
        return [];
    }
    return all;
};  

export const getCategoryAncestors = async (id) => {
    const ancestors = [];
    const category = await getCategoryProductByIdRepository(id);
    if (!category) {
        throw new Error('Categoria de producto no encontrada');
    }

    let currentId = category.parent_id;

    const seen = new Set();
    while (currentId) {
        if(seen.has(currentId)) {
            throw new Error('Ciclo detectado en la jerarquía de categorías');
        }
        seen.add(currentId);

        const category = await getCategoryProductByIdRepository(currentId);
        if (!category) break;

        ancestors.push({
            id: category.id,
            name: category.name,
            parent_id: category.parent_id
        });
        currentId = category.parent_id;
    }

    return ancestors.reverse();
};

export const getCategoryDescendants = async (id) => {
    const descendants = [];
    const rootCategory = await getCategoryProductByIdRepository(id);
    
    if (!rootCategory) {
        throw new Error('Categoría no encontrada');
    }

    // BFS (Breadth-First Search) para obtener todos los descendientes
    const queue = [id];
    const seen = new Set([id]); // Incluir el id inicial para evitar ciclos

    while (queue.length > 0) {
        const currentId = queue.shift();
        
        // Buscar todos los hijos directos del currentId
        const children = await getAllDescendantsRepository(currentId);

        for (const child of children) {
            if(!child || !child.id) continue;

            if (seen.has(child.id)) {
                throw new Error('Ciclo detectado en la jerarquía de categorías');
            }
            
            seen.add(child.id);
            
            // Solo agregar si NO es la categoría original
            if (child.id !== id) {
                descendants.push({
                    id: child.id,
                    name: child.name,
                    parent_id: child.parent_id
                });
                queue.push(child.id);
            }
        }
    }

    return descendants;
};

export const getCategoryProductByName = async (name) => {
    if(!name) {
        throw new Error('Nombre de categoria de producto no proporcionado');
    }
    const category = await getCategoryProductByNameRepository(name.trim().toLowerCase());
    if (!category) throw new Error('Categoria de producto no encontrada');
    return category;
};


export const createCategoryProduct = async (data) => {
    let { name, description, parent_id } = data || null;

    name = name ? name.trim().toLowerCase() : null;
    description = description ? description.trim() : null;
    
    const existingCategory = await getCategoryProductByNameRepository(name);
    validateCategoryProductData({ name, description, existingCategory });

    if(parent_id !== undefined && parent_id !== null) {
        const parent = await getCategoryProductByIdRepository(parent_id);
        if (!parent) {
            throw new Error('Categoria padre no encontrada');
        }
    }

    const created = await createCategoryProductRepository({name, description, parent_id: parent_id || null});

    return created;
};

export const updateCategoryProduct = async (id, data) => {
    let { name, description, parent_id } = data;
    
    if(name !== undefined && name !== null) name = name.trim().toLowerCase();
    
    if(description !== undefined && description !== null) {
        description = description ? description.trim(): null;
    }

    const existing = await getCategoryProductByIdRepository(id);
    if (!existing) throw new Error('Categoria de producto no encontrada');

    if(name && name !== existing.name) {
        const duplicate = await getCategoryProductByNameRepository(name);
        if (duplicate && duplicate.id !== Number(id)) {
            throw new Error('Ya existe una categoria de producto con ese nombre');
        }
    }

    if(parent_id !== undefined) {
        if(Number(parent_id) === Number(id)) {
            throw new Error('Una categoría no puede ser padre de sí misma');
        } 
        if (parent_id !== null) {
            const parent = await getCategoryProductByIdRepository(parent_id);
            if (!parent) throw new Error('Categoria padre no encontrada');

            const descendants = await getCategoryDescendants(id);
            const descendantIds = descendants.map(desc => desc.id);
            if (descendantIds.includes(Number(parent_id))) {
                throw new Error('No se puede asignar una categoría hija como padre');
            }
        }
    } else {
        parent_id = existing.parent_id;
    }       

    const updated = await updateCategoryProductRepository(id, { 
        name: name ?? existing.name, 
        description: description ?? existing.description, 
        parent_id: parent_id ?? existing.parent_id 
    });

    return updated;
}

export const deleteCategoryProduct = async (id) => {
    const category = await getCategoryProductByIdRepository(id);
    if (!category) throw new Error('Categoria de producto no encontrada');

    const hasChildren = await hasCategoryChildrenRepository(id);
    if (hasChildren) {
        throw new Error('No se puede eliminar la categoria de producto porque tiene subcategorias asociadas');
    }

    // * Habilitar cuando se implemente el modelo de Producto
    // const hasProducts = await hasProductsInCategoryRepository(id);
    // if (hasProducts) {
    //     throw new Error('No se puede eliminar la categoria de producto porque tiene productos asociados');
    // }

    await deleteCategoryProductRepository(id);
    return;
};