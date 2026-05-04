import {
    getAllUnitsRepository,
    getUnitByIdRepository,
    createUnitRepository,
    updateUnitRepository,
    deleteUnitRepository
} from './unit.repository.js';
import { unitDTO } from './unit.dto.js';

export const getAllUnitsService = async () => {
    const units = await getAllUnitsRepository();

    const payload = units.map(unit => unitDTO(unit));

    return payload;
}

export const getUnitByIdService = async (id) => {
    const unit = await getUnitByIdRepository(id);
    if (!unit) {
        throw new Error('Unidad no encontrada');
    }
    const payload = unitDTO(unit);

    return payload;
}

export const createUnitService = async (data) => {
    let {base_unit_id = null} = data;
    
    if(base_unit_id !== null) {
        const baseUnit = await getUnitByIdRepository(base_unit_id);
        
        if (!baseUnit) throw new Error('La unidad base no existe');

        if (baseUnit.base_unit_id !== null) {
            throw new Error('La unidad base no puede ser una unidad derivada de otra');
        }
    }
    
    const newUnit = await createUnitRepository({...data, base_unit_id});

    const payload = unitDTO(newUnit);

    return payload;
}

export const updateUnitService = async (id, data) => {
    let {base_unit_id = null} = data;

    const existing = await getUnitByIdRepository(id);
    if (!existing) {
        throw new Error('Unidad no encontrada para actualizar');
    }
    
    if(base_unit_id !== null) {
        const baseUnit = await getUnitByIdService(base_unit_id);
        if (!baseUnit) throw new Error('La unidad base no existe');
        if (baseUnit.id === data.id) {
            throw new Error('Una unidad no puede ser su propia unidad base');
        }
        if (baseUnit.base_unit_id !== null) {
            throw new Error('La unidad base no puede ser una unidad derivada de otra');
        }
    }

    const updatedUnit = await updateUnitRepository(id, {...data, base_unit_id});

    const payload = unitDTO(updatedUnit);

    return payload;
}

export const deleteUnitService = async (id) => {
    const unit = await getUnitByIdRepository(id);
    if (!unit || !unit.is_active) {
        throw new Error('Unidad no encontrada para eliminar');
    }
    return await deleteUnitRepository(id);
}