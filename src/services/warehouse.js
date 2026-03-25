import {
    findWarehouseByName,
    findAllWarehousesRepository,
    createWarehouseRepository,
    updateWarehouseRepository,
    deleteWarehouseRepository
} from '../repositories/warehouse.js';
import { validateWarehouseData } from '../dtos/warehouse.js';

export const getAllWarehouses = async () => {
    const warehouses = await findAllWarehousesRepository(); 
    if (!warehouses || warehouses.length === 0) {
        throw new Error('No se encontraron almacenes');
    }
    return warehouses;
}

export const getWarehouseByName = async (name) => {
    const warehouse = await findWarehouseByName(name);
    if (!warehouse) {
        throw new Error('Almacen no encontrado');
    }
    return warehouse;
}

export const createWarehouse = async ({ data, currentUser }) => {
    let { name, code } = data;
    if (currentUser.role !== 'admin' && currentUser.role !== 'superadmin') {
        throw new Error('No tienes permiso para crear almacenes');
    }
    const existingWarehouse = await findWarehouseByName(name);

    if (!name) throw new Error('El nombre del almacen es obligatorio');
    if (!code) throw new Error('El codigo del almacen es obligatorio');
    
    code = code.toUpperCase();
    
    validateWarehouseData({ name, code, existingWarehouse });
    
    return await createWarehouseRepository({ name, code });
}

export const updateWarehouse = async (id, { data, currentUser }) => {
    let { name, code } = data;
    if (currentUser.role !== 'admin' && currentUser.role !== 'superadmin') {
        throw new Error('No tienes permiso para actualizar almacenes');
    }
    const existingWarehouse = await findWarehouseByName(name);
    
    code = code.toUpperCase();
    validateWarehouseData({ name, code, existingWarehouse });

    return await updateWarehouseRepository(id, { name, code });
}

export const deleteWarehouse = async (id, { currentUser }) => {
    if (currentUser.role !== 'admin' && currentUser.role !== 'superadmin') {
        throw new Error('No tienes permiso para eliminar almacenes');
    }
    return await deleteWarehouseRepository(id);
}