import {
  createMovementTypeRepository,
  getAllMovementTypesRepository,
  getMovementTypeByIdRepository,
  updateMovementTypeRepository,
  deleteMovementTypeRepository
} from "./movement_type.repository.js";
import { movementTypeDTO } from "./movement_type.dto.js";

export const getAllMovementTypesService = async () => {
    const types = await getAllMovementTypesRepository();
    
    const payload = types.map(movementTypeDTO);
    return payload;
};

export const getMovementTypeByIdService = async (id) => {
    const movementTypeId = Number(id);
    
    if (isNaN(movementTypeId)) {
        throw new Error("ID inválido");
    }
    
    const movementType = await getMovementTypeByIdRepository(movementTypeId);
    
    if (!movementType) {
        throw new Error("Tipo de movimiento no encontrado");
    }
    
    const payload = movementTypeDTO(movementType);
    
    return payload;
};

export const createMovementTypeService = async (data) => {

  const { type } = data;

  const typeFormatted = type.trim().toUpperCase(); 

  const movementType = await createMovementTypeRepository({ ...data, type: typeFormatted });

  const payload = movementTypeDTO(movementType);

  return payload;
};

export const updateMovementTypeService = async (id, data) => {
  
  const { type } = data;

  const typeFormatted = type.trim().toUpperCase();
  
  const movementTypeId = Number(id);

  if (isNaN(movementTypeId)) {
    throw new Error("ID inválido");
  }

  const movementType = await getMovementTypeByIdRepository(movementTypeId);

  if (!movementType) {
    throw new Error("Tipo de movimiento no encontrado");
  }

  const updatedMovementType = await updateMovementTypeRepository(movementType, { ...data, type: typeFormatted });

  const payload = movementTypeDTO(updatedMovementType);

  return payload;
};

export const deleteMovementTypeService = async (id) => {
  const movementTypeId = Number(id);

  if (isNaN(movementTypeId)) {
    throw new Error("ID inválido");
  }

  const movementType = await getMovementTypeByIdRepository(movementTypeId);

  if (!movementType) {
    throw new Error("Tipo de movimiento no encontrado");
  }

  return await deleteMovementTypeRepository(movementType);
};