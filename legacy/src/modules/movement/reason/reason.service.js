import {
    createReasonRepository,
    getAllReasonsRepository,
    getReasonByIdRepository,
    updateReasonRepository,
    deleteReasonRepository
} from "./reason.repository.js";
import { reasonDTO } from "./reason.dto.js";

export const getAllReasonsService = async () => {

    const reasons = await getAllReasonsRepository();

    const payload = reasons.map(reasonDTO);

    return payload;
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

    const payload = reasonDTO(reason);

    return payload;
};

export const createReasonService = async (data) => {

    const { type } = data;

    const typeFormatted = type.trim().toUpperCase();

    const reason = await createReasonRepository({ type: typeFormatted });

    const payload = reasonDTO(reason);
    
    return payload;
};

export const updateReasonService = async (id, data) => {

    const { type } = data;

    const typeFormatted = type.trim().toUpperCase();

    const reasonId = Number(id);

    if (isNaN(reasonId)) {
        throw new Error("ID inválido");
    }

    const reason = await getReasonByIdRepository(reasonId);

    if (!reason) {
        throw new Error("Razón no encontrada");
    }

    const updatedReason = await updateReasonRepository(reason, { type: typeFormatted });

    const payload = reasonDTO(updatedReason);

    return payload;
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