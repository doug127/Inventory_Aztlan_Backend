import {
    getAllWarehouses,
    getWarehouseByName,
    createWarehouse,
    updateWarehouse,
    deleteWarehouse
} from '../services/warehouse.js';

export const fetchAllWarehousesControllers = async (req, res) => {
    try {
        const warehouses = await getAllWarehouses();
        res.status(200).json(warehouses);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

export const fetchWarehouseByNameController = async (req, res) => {
    try {
        const { name } = req.params;
        const warehouse = await getWarehouseByName(name);
        res.status(200).json(warehouse);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

export const createWarehouseController = async (req, res) => {
    try {
        const warehouse = await createWarehouse({ data: req.body, currentUser: req.user });
        res.status(201).json(warehouse);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }   
};

export const updateWarehouseController = async (req, res) => {
    try {
        const { id } = req.params;
        const warehouse = await updateWarehouse(id, { data: req.body, currentUser: req.user });
        res.status(200).json(warehouse);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

export const deleteWarehouseController = async (req, res) => {
    try {
        const { id } = req.params;
        await deleteWarehouse(id, { currentUser: req.user });
        res.status(200).json({ message: 'Almacen eliminado exitosamente' });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};
