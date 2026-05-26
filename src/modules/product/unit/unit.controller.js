import {
    getAllUnitsService,
    getUnitByIdService,
    getBaseUnitsService,
    createUnitService,
    updateUnitService,
    deleteUnitService
} from './unit.service.js';

export const getAllUnitsController = async (req, res) => {
    try {
        const units = await getAllUnitsService();
        res.status(200).json(units);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const getUnitByIdController = async (req, res) => {
    try {
        const { id } = req.params;
        const unit = await getUnitByIdService(id);
        res.status(200).json(unit);
    } catch (error) {
        res.status(404).json({ error: error.message });
    }
};

export const getBaseUnitsController = async (req, res) => {
    try {
        const units = await getBaseUnitsService();
        res.status(200).json(units);
    } catch (error) {
        res.status(404).json({ error: error.message });
    }
};

export const createUnitController = async (req, res) => {
    try {
        const data = req.validatedData;  
        const newUnit = await createUnitService(data);
        res.status(201).json(newUnit);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

export const updateUnitController = async (req, res) => {
    try {
        const { id } = req.params;
        const data = req.validatedData;  
        const updatedUnit = await updateUnitService(id, data);
        res.status(200).json(updatedUnit);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

export const deleteUnitController = async (req, res) => {
    try {
        const { id } = req.params;
        const deletedUnit = await deleteUnitService(id);
        res.status(200).json(deletedUnit);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};