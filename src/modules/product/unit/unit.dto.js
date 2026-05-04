export const unitDTO = (unit) => {
    return {
        name: unit.name,
        code: unit.code,
        is_active: unit.is_active,
        base_unit_id: unit.base_unit_id,
        conversion_factor: unit.conversion_factor
    }
};