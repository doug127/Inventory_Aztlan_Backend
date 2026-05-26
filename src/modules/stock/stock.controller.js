import {
    getAllStocksService,
    increaseStockService,
    decreaseStockService,
    adjustStockService
} from './stock.service.js';

export const getAllStocksController = async (req, res) => {
    try {
        const result = await getAllStocksService(req.query);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

export const increaseStockController = async (req, res) => {
    try {
        const { product_id, warehouse_id, amount } = req.body;
        const result = await increaseStockService({ product_id, warehouse_id, amount });
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }   
}

export const decreaseStockController = async (req, res) => {
    try {
        const { product_id, warehouse_id, amount } = req.body;
        const result = await decreaseStockService({ product_id, warehouse_id, amount });
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

export const adjustStockController = async (req, res) => {
    try {
        const userId = req.user.id;
        console.log('ID del usuario que realiza el ajuste:', userId);
        console.log('Datos recibidos para ajuste de stock:', req.body);
        const result = await adjustStockService(userId, req.body);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}