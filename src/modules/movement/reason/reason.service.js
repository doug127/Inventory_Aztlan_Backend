import {
    createReasonRepository,
    getAllReasonsRepository,
    getReasonByIdRepository,
    updateReasonRepository,
    deleteReasonRepository
} from "./reason.repository.js";
import { ReasonsDTO } from "./reason.schema.js";

export const getAllReasonsService = async () => {

    const reasons = await getAllReasonsRepository();

    return {
        data: reasons
    };
};

export const getReasonByIdService = async (id) => {

    const reasonId = Number(id);

    if (isNaN(reasonId)) {
        throw new Error("ID inválido");
    }

    const reason = await getReasonByIdRepository(reasonId);

    if (!reason) {
        throw new Error("Razón no encontrada");
    }

    return {
        data: reason
    };
};

export const createReasonService = async (data) => {

    const reasonDTO = new ReasonsDTO(data);

    const dto = reasonDTO.validate();

    const reason = await createReasonRepository(dto);

    return {
        data: reason
    };
};

export const updateReasonService = async (id, data) => {

    const reasonId = Number(id);

    if (isNaN(reasonId)) {
        throw new Error("ID inválido");
    }

    const reason = await getReasonByIdRepository(reasonId);

    if (!reason) {
        throw new Error("Razón no encontrada");
    }

    const reasonDTO = new ReasonsDTO(data);

    const dto = reasonDTO.validate();

    const updatedReason = await updateReasonRepository(reason, dto);

    return {
        data: updatedReason
    };
};

export const deleteReasonService = async (id) => {

    const reasonId = Number(id);

    if (isNaN(reasonId)) {
        throw new Error("ID inválido");
    }

    const reason = await getReasonByIdRepository(reasonId);

    if (!reason) {
        throw new Error("Razón no encontrada");
    }

    await deleteReasonRepository(reason);

    return {
        message: "Razón eliminada correctamente"
    };
};