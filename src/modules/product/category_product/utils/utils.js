
import {
    getCategoryProductByIdRepository,
    getCategoryProductByNameRepository,
    getAllDescendantsRepository,
    getRootCategoryProductRepository,
    getAllCategoryProductsRepository,
    createCategoryProductRepository,
    updateCategoryProductRepository,
    deleteCategoryProductRepository,
} from "../category_product.repository.js";

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
            parent: category.parent ? category.parent.name : null
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
                    parent: child.parent ? child.parent.name : null
                });
                queue.push(child.id);
            }
        }
    }

    return descendants;
};

export const buildCategoryTree = async (parentId = null) => {

    const categories =
        await getRootCategoryProductRepository(parentId);

    return Promise.all(
        categories.map(async (category) => {

            const children =
                await buildCategoryTree(category.id);

            return {
                id: category.id,
                name: category.name,
                children,
            };
        })
    );
};
