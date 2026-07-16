import { Warehouse } from '#src/database/models/index.model.js';

export const findWarehouseByName = (name) => {
    return Warehouse.findOne({ where: { name } });
};

export const findAllWarehousesRepository = async () => {
    return await Warehouse.findAll();
};

export const createWarehouseRepository = async (warehouseData) => {
    return await Warehouse.create(warehouseData);
}

export const updateWarehouseRepository = async (id, updates) => {
    const warehouse = await Warehouse.findByPk(id);
    if (!warehouse) {
        throw new Error('Almacen no encontrado');
    }
    return await warehouse.update(updates);
}

export const deleteWarehouseRepository = async (id) => {
    const warehouse = await Warehouse.findByPk(id);
    if (!warehouse) {
        throw new Error('Almacen no encontrado');
    }
    return await warehouse.destroy();
}