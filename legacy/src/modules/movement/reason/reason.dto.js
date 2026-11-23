import { id } from "zod/v4/locales";

export const reasonDTO = (reason) => {
    return {
        id: reason.id,
        type: reason.type
    };
};