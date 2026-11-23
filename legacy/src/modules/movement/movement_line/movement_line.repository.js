import { MovementLine } from "#src/database/models/index.model.js";

export const bulkCreateMovementLineRepository = async (lines, transaction) => {
    return await MovementLine.bulkCreate(lines, { transaction });
};

