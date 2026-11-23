import { MovementType } from "#src/database/models/index.model.js";

export const getAllMovementTypesRepository = async () => {
    return await MovementType.findAll({
        attributes: ["id", "type"],
        order: [["id", "ASC"]]
    });
};

export const getMovementTypeByIdRepository = async (id) => {
    return await MovementType.findByPk(id);
};

export const createMovementTypeRepository = async (data) => {
  return await MovementType.create(data);
};

export const updateMovementTypeRepository = async (movementType, data) => {
  return await movementType.update(data);
};

export const deleteMovementTypeRepository = async (movementType) => {
  return await movementType.destroy();
};