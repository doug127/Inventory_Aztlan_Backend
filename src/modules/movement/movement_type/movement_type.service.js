import {
  createMovementTypeRepository,
  getAllMovementTypesRepository,
  getMovementTypeByIdRepository,
  updateMovementTypeRepository,
  deleteMovementTypeRepository
} from "./movement_type.repository.js";
import { MovementTypesDTO } from "./movement_type.schema.js";

export const getAllMovementTypesService = async () => {
    const types = await getAllMovementTypesRepository();
    
    return {
        data: types
    };
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
    
    return {
        data: movementType
    };
};

export const createMovementTypeService = async (data) => {
  const movementTypeDTO = new MovementTypesDTO(data);

  const dto = movementTypeDTO.validate();

  const movementType = await createMovementTypeRepository(dto);

  return {
    data: movementType
  };
};

export const updateMovementTypeService = async (id, data) => {

  const movementTypeId = Number(id);

  if (isNaN(movementTypeId)) {
    throw new Error("ID inválido");
  }

  const movementType = await getMovementTypeByIdRepository(movementTypeId);

  if (!movementType) {
    throw new Error("Tipo de movimiento no encontrado");
  }

  const movementTypeDTO = new MovementTypesDTO(data);

  const dto = movementTypeDTO.validate();

  const updatedMovementType = await updateMovementTypeRepository(movementType, dto);

  return {
    data: updatedMovementType
  };
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