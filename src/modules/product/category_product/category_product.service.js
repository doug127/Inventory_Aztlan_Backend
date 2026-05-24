import { 
    getAllCategoryProductsRepository,
    getAllDescendantsRepository,
    getCategoryProductByNameRepository,
    getRootCategoryProductRepository,
    createCategoryProductRepository,
    updateCategoryProductRepository,
    getCategoryProductByIdRepository,
    deleteCategoryProductRepository,
    hasCategoryChildrenRepository,
    hasProductsInCategoryRepository
} from "./category_product.repository.js";
import { getCategoryAncestors, getCategoryDescendants, buildCategoryTree } from "./utils/utils.js";
import {
    categoryProductDTO
} from './category_product.dto.js';

export const getAllCategoryProducts = async () => {
    const all = await getAllCategoryProductsRepository();

    const payload = await Promise.all(
        all.map(async (category) => {

            const ancestors = await getCategoryAncestors(category.id);
            const descendants = await getCategoryDescendants(category.id);

            return categoryProductDTO(
                category,
                ancestors,
                descendants
            );
        })
    );

    return payload.filter(category => category !== null);
};  

export const getCategoryProductByName = async (name) => {

    if (!name) {
        throw new Error(
            'Nombre de categoria de producto no proporcionado'
        );
    }

    const category =
        await getCategoryProductByNameRepository(
            name.trim().toLowerCase()
        );

    if (!category) {
        throw new Error(
            'Categoria de producto no encontrada'
        );
    }

    const ancestors =
        await getCategoryAncestors(category.id);

    const descendants =
        await getCategoryDescendants(category.id);

    const payload = categoryProductDTO(
        category,
        ancestors,
        descendants
    );

    return payload;
};

export const getRootCategoryProduct = async () => {

    return await buildCategoryTree(null);
};

export const createCategoryProduct = async (data) => {
    let { name, description, parent_id } = data || null;

    name = name ? name.trim().toLowerCase() : null;
    description = description ? description.trim() : null;
    
    const existingCategory = await getCategoryProductByNameRepository(name);
    if (existingCategory) {
        throw new Error('Ya existe una categoria de producto con ese nombre');
    }
    
    if(parent_id !== undefined && parent_id !== null) {
        const parent = await getCategoryProductByIdRepository(parent_id);
        if (!parent) {
            throw new Error('Categoria padre no encontrada');
        }
    }

    const created = await createCategoryProductRepository({name, description, parent_id: parent_id || null});

    const payload = categoryProductDTO(created);

    return payload;
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

    const payload = categoryProductDTO(updated);

    return payload;
}

export const deleteCategoryProduct = async (id) => {
    const category = await getCategoryProductByIdRepository(id);
    if (!category) throw new Error('Categoria de producto no encontrada');

    const hasChildren = await hasCategoryChildrenRepository(id);
    if (hasChildren) {
        throw new Error('No se puede eliminar la categoria de producto porque tiene subcategorias asociadas');
    }

    const hasProducts = await hasProductsInCategoryRepository(id);
    if (hasProducts) {
        throw new Error('No se puede eliminar la categoria de producto porque tiene productos asociados');
    }

    await deleteCategoryProductRepository(id);
    return;
};