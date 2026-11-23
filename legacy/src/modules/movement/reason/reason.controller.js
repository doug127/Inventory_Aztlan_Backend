import {
    createReasonService,
    getAllReasonsService,
    getReasonByIdService,
    updateReasonService,
    deleteReasonService
} from "./reason.service.js";

export const createReasonController = async (req, res) => {
    try {
        const result = await createReasonService(req.validatedData);
        console.log("Reason created:", req.validatedData);
        res.status(201).json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

export const getAllReasonsController = async (req, res) => {
    try {
        const result = await getAllReasonsService();
        res.status(200).json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

export const getReasonByIdController = async (req, res) => {
    try {
        const result = await getReasonByIdService(req.params.id);
        res.status(200).json(result);
    } catch (error) {
        res.status(404).json({ error: error.message });
    }
};

export const updateReasonController = async (req, res) => {
    try {
        const result = await updateReasonService(req.params.id, req.validatedData);
        res.status(200).json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

export const deleteReasonController = async (req, res) => {
    try {
        const result = await deleteReasonService(req.params.id);
        res.status(200).json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};