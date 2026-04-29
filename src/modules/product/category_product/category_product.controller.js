import {
    getAllCategoryProducts,
    getCategoryProductByName,
    getCategoryAncestors,
    getCategoryDescendants,
    createCategoryProduct,
    updateCategoryProduct,
    deleteCategoryProduct
} from "./category_product.service.js";

export const getAllCategoryProductsController = async (req, res) => {
    try {
        const categories = await getAllCategoryProducts();
        res.status(200).json(categories);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const getCategoryProductByNameController = async (req, res) => {
    try {
        const { name } = req.params;

        const category = await getCategoryProductByName(name);
        if (!category) {
            return res.status(404).json({ error: 'Categoria de producto no encontrada' });
        }

        const ancestors = await getCategoryAncestors(category.id);
        if(ancestors.length === 0) {
            const descendants = await getCategoryDescendants(category.id);
            return res.status(200).json({ 
                category, 
                descendants 
            });
        } else {
            res.status(200).json({ 
                category, 
                ancestors 
            });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const createCategoryProductController = async (req, res) => {
    try {
        const newCategory = await createCategoryProduct(req.body);
        res.status(201).json(newCategory);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }   
};

export const updateCategoryProductController = async (req, res) => {
    try {
        const updatedCategory = await updateCategoryProduct(req.params.id, req.body);
        res.status(200).json(updatedCategory);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const deleteCategoryProductController = async (req, res) => {
    try {
        await deleteCategoryProduct(req.params.id);
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};