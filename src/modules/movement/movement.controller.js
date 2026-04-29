import {
    createMovementService,
    getFilteredMovementsServices,
    getMovementByIdService,
    getProductMovementsService
} from "./movement.service.js";

export const getAllMovementsControllers = async (req, res) => {
    try {
        const result = await getFilteredMovementsServices(req.query);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

export const getMovementByIdController = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await getMovementByIdService(id);
        res.status(200).json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

export const getProductMovementsController = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await getProductMovementsService(id, req.query);
        res.status(200).json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

export const createMovementController = async (req, res) => {
    try {
        const payload = req.body;
        const id = req.user.id;

        const movement = await createMovementService(payload, id);

        res.status(201).json(movement);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};