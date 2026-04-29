import {
    getAllProductsService,
    getProductByIdService,
    getAllByFilterProductsService,
    createProductService,
    updateProductService,
    deleteProductService
} from './product.service.js';

export const getAllProductsController = async (req, res) => {   
    try {
        const products = await getAllProductsService();
        res.status(200).json(products);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }   
};

export const getProductByIdController = async (req, res) => {
    try {
        const { id } = req.params;
        const product = await getProductByIdService(id);
        res.status(200).json(product);
    } catch (error) {
        res.status(404).json({ message: error.message });
    }
};

export const getAllByFilterProductsController = async (req, res) => {
    try {
        const products = await getAllByFilterProductsService(req.query);
        res.status(200).json(products);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

export const createProductController = async (req, res) => {
    try {
        const createdProduct = await createProductService(req.body);
        res.status(201).json(createdProduct);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

export const updateProductController = async (req, res) => {
    try {
        const { id } = req.params;
        const updatedProduct = await updateProductService(id, req.body);
        res.status(200).json(updatedProduct);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

export const deleteProductController = async (req, res) => {
    try {
        const { id } = req.params;
        await deleteProductService(id);
        res.status(204).send();
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};