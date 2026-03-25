import { Reason } from "../models/Reason.js";

export const getAllReasonsRepository = async () => {
    return await Reason.findAll({
        attributes: ["id", "type"],
        order: [["id", "ASC"]]
    });
};

export const getReasonByIdRepository = async (id) => {
    return await Reason.findByPk(id);
};

export const createReasonRepository = async (data) => {
    return await Reason.create(data);
};

export const updateReasonRepository = async (reason, data) => {
    return await reason.update(data);
};

export const deleteReasonRepository = async (reason) => {
    return await reason.destroy();
};