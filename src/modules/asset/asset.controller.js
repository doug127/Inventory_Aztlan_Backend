import {
    createAssetService,
    getAllAssetsService,
    getAssetByIdService,
    updateAssetService,
    deleteAssetService
} from "./asset.service.js";

export const createAssetController = async (req, res) => {
    try {
        const data = await createAssetService(req.validatedData);
        res.status(201).json(data);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

export const getAllAssetsController = async (req, res) => {
    try {
        const data = await getAllAssetsService();
        res.json(data);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const getAssetByIdController = async (req, res) => {
    try {
        const data = await getAssetByIdService(req.params.id);
        res.json(data);
    } catch (error) {
        res.status(404).json({ message: error.message });
    }
};

export const updateAssetController = async (req, res) => {
    try {
        const data = await updateAssetService(req.params.id, req.validatedData);
        res.json(data);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

export const deleteAssetController = async (req, res) => {
    try {
        const data = await deleteAssetService(req.params.id);
        res.json(data);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};