import { MovementLine } from "../models/index.js";

export const bulkCreateMovementLineRepository = async (lines, transaction) => {
    return await MovementLine.bulkCreate(lines, { transaction });
};

