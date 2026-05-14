import { id } from "zod/v4/locales";

export const unitDTO = (unit) => {
    const u = unit.get ? unit.get() : unit;

    return {
        id: u.id,
        name: u.name,
        code: u.code,
        is_active: u.is_active,
        base_unit: u.base_unit ? {
            id: u.base_unit.id,
            name: u.base_unit.name,
            code: u.base_unit.code
        } : null,
        conversion_factor: u.conversion_factor
    }
};