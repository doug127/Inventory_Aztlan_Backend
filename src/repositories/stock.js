import { Product, Warehouse, Stock, Unit, CategoryProduct } from "../models/index.js";

export const findStockRepository = async (product_id, warehouse_id) => {
    return await Stock.findOne({
        where: { product_id, warehouse_id },
        attributes: ['quantity'],
        include: [
            {
                model: Product,
                attributes: ['id', 'name', 'code', 'content_quantity', 'min_stock', 'max_stock'],
                include: [
                    {
                        model: Unit,
                        attributes: ['id', 'name', 'code']
                    },
                    {
                        model: CategoryProduct,
                        attributes: ['id', 'name']
                    }
                ]
            }
        ]
    });
}

export const findStockForUpdateRepository = async (product_id, warehouse_id, transaction) => {
    return await Stock.findOne({
        where: { product_id, warehouse_id },
        transaction,
        lock: transaction.LOCK.UPDATE
    });
}

export const createStockRepository = async (data, transaction=null) => {
    return await Stock.create(data, { transaction });
}

export const updateStockRepository = async (stockInstance, newQuantity, transaction=null) => {
    stockInstance.quantity = newQuantity;
    await stockInstance.save({ transaction });
    return stockInstance;
}

// ? A futuro vamos a trabajar en este repositorio para dividir en consultas para listados, reportes
// ? y detalles de stock. 
export const getAllStocksRepository = async ({where, limit, offset, order}) => {  
    const options = {
        where,
        attributes: ['quantity'],
        include: [
            {
                model: Product,
                attributes: ['id', 'name', 'code'],
                include: [
                    {
                        model: Unit,
                        attributes: ['code']
                    },
                    {
                        model: CategoryProduct,
                        attributes: ['name']
                    }
                ]
            }
        ],
        limit,
        offset,
        order: [['id', order]]
    };

    const { count, rows } = await Stock.findAndCountAll(options);
    return { count, stocks: rows };
}

export const createInventoryAdjustmentRepository = async (data, transaction = null) => {
  return await Stock.create(data, { transaction });
};
