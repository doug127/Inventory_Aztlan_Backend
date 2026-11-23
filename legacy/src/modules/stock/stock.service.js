import {
    findStockRepository,
    findStockForUpdateRepository,
    createStockRepository,
    updateStockRepository,
    getAllStocksRepository,
    createInventoryAdjustmentRepository
} from './stock.repository.js';
import { parseNumericRangeFromQuery, applyNumericFiltersToWhere } from '#src/shared/utils/query.js';
import { Stock } from '#src/database/models/index.model.js';

export const getAllStocksService = async (query) => {
    
    const filters = {};

    if (query.product_id) filters.product_id = Number(query.product_id);
    if (query.warehouse_id) filters.warehouse_id = Number(query.warehouse_id);

    filters.quantity = parseNumericRangeFromQuery(query, 'quantity');

    const where = {};
    if (filters.product_id) where.product_id = filters.product_id;
    if (filters.warehouse_id) where.warehouse_id = filters.warehouse_id;
    applyNumericFiltersToWhere(where, filters.quantity, 'quantity');

    const limit = query.limit ? Number(query.limit) : 10;
    const page = query.page ? Number(query.page) : 1;
    const offset = (page - 1) * limit;

    if (isNaN(limit) || limit <= 0) {
        throw new Error('El parámetro limit debe ser un número entero positivo');
    }
    if (isNaN(page) || page <= 0) {
        throw new Error('El parámetro page debe ser un número entero positivo');
    }

    const order = query.order === 'DESC' ? 'DESC' : 'ASC';

    const { count, stocks } = await getAllStocksRepository({ where, limit, offset, order });

    const totalPages = Math.ceil(count / limit);

    return {
        data: stocks,
        meta: {
            total: count,
            page,
            limit,
            totalPages,
            hasNextPage: page < totalPages,
            hasPreviousPage: page > 1
        }
    };
}

export const increaseStockService = async ({product_id, warehouse_id, amount}) => {
    if (amount <= 0) {
        throw new Error('La cantidad a incrementar debe ser mayor que cero');
    }

    return await Stock.sequelize.transaction(async (transaction) => {
        const stock = await findStockForUpdateRepository(product_id, warehouse_id, transaction);
        
        if (!stock) {
            const newStock = await createStockRepository(
                {product_id, warehouse_id, amount}, 
                transaction
            );
            
            return {
                message: 'Stock creado exitosamente',
                quantity: newStock.quantity,
            };
        }

        const newQuantity = stock.quantity + amount;

        await updateStockRepository(stock, newQuantity, transaction);

        return {
            message: 'Stock incrementado exitosamente',
            quantity: newQuantity,
        };
    });
}

export const decreaseStockService = async ({product_id, warehouse_id, amount}) => {
    if (amount <= 0) {
        throw new Error('La cantidad a decrementar debe ser mayor que cero');
    }

    return await Stock.sequelize.transaction(async (transaction) => {
        const stock = await findStockForUpdateRepository(product_id, warehouse_id, transaction);
        
        if (!stock) {
            throw new Error('No existe stock para el producto y almacén especificados');
        }

        if (stock.quantity < amount) {
            throw new Error('Stock insuficiente');
        }

        const newQuantity = stock.quantity - amount;

        await updateStockRepository(stock, newQuantity, transaction);

        return {
            message: 'Stock decrementado exitosamente',
            quantity: newQuantity,
        };
    });
}

export const adjustStockService = async (userId, data) => {
    const { product_id, warehouse_id, adjustment, reason } = data;
    console.log(data);
    console.log('Ajuste de stock solicitado:', { product_id, warehouse_id, adjustment, reason });
    if (isNaN(adjustment) || adjustment === 0) {
        throw new Error('La nueva cantidad debe ser un número entero diferente de cero');
    }

    if (!reason || reason.trim() === '') {
        throw new Error('La razón del ajuste es obligatoria');
    }

    return await Stock.sequelize.transaction(async (transaction) => {
        const stock = await findStockForUpdateRepository(product_id, warehouse_id, transaction);

        if (!stock) {
            throw new Error('Stock no encontrado');
        }

        const previousQuantity = stock.quantity;
        const newQuantity = previousQuantity + adjustment;

        if (newQuantity < 0) {
            throw new Error('La cantidad ajustada no puede ser menor de cero');
        }

        await updateStockRepository(stock, newQuantity, transaction);

        // eliminar esta función y modificar para poder crear las tablas 
        // movement_headers y movement_lines para poder completar la función de crear ajustes de inventario
        
        await createInventoryAdjustmentRepository(
            {
                product_id,
                warehouse_id,
                previous_quantity: previousQuantity,
                adjustment,
                new_quantity: newQuantity,
                reason,
                created_by_user_id: userId
            }, transaction
        );

        return {
            message: 'Stock ajustado exitosamente',
            previousQuantity,
            adjustment,
            newQuantity
        };
    });
}