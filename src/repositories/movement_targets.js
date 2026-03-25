import { MovementTarget } from "../models/index.js";

export const bulkCreateMovementTargetsRepository = async (data, transaction) => {
    return await MovementTarget.bulkCreate(data, { transaction });
};