import {
    createAssetTypeService,
    getAllAssetTypesService,
    getAssetTypeByIdService,
    updateAssetTypeService,
    deleteAssetTypeService
} from "./asset_type.service.js";

export const createAssetTypeController = async (req, res) => {
    try {
        const data = await createAssetTypeService(req.validatedData);
        res.status(201).json(data);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

export const getAllAssetTypesController = async (req, res) => {
    try {
        const data = await getAllAssetTypesService();
        res.json(data);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const getAssetTypeByIdController = async (req, res) => {
    try {
        const data = await getAssetTypeByIdService(req.params.id);
        res.json(data);
    } catch (error) {
        res.status(404).json({ message: error.message });
    }
};

export const updateAssetTypeController = async (req, res) => {
    try {
        const data = await updateAssetTypeService(req.params.id, req.validatedData);
        res.json(data);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

export const deleteAssetTypeController = async (req, res) => {
    try {
        const data = await deleteAssetTypeService(req.params.id);
        res.json(data);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};