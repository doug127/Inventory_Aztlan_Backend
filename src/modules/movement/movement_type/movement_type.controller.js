import {
  createMovementTypeService,
  getAllMovementTypesService,
  getMovementTypeByIdService,
  updateMovementTypeService,
  deleteMovementTypeService
} from "./movement_type.service.js";

export const createMovementTypeController = async (req, res) => {
  try {
    const result = await createMovementTypeService(req.body);
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

export const getAllMovementTypesController = async (req, res) => {
  try {
    const result = await getAllMovementTypesService();
    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

export const getMovementTypeByIdController = async (req, res) => {
  try {
    const result = await getMovementTypeByIdService(req.params.id);
    res.status(200).json(result);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
};

export const updateMovementTypeController = async (req, res) => {
  try {
    const result = await updateMovementTypeService(req.params.id, req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

export const deleteMovementTypeController = async (req, res) => {
  try {
    const result = await deleteMovementTypeService(req.params.id);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};