import { MovementTarget } from "#src/database/models/index.model.js";

export const bulkCreateMovementTargetsRepository = async (data, transaction) => {
    return await MovementTarget.bulkCreate(data, { transaction });
};