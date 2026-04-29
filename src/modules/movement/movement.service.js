import { MovementDto } from "./movement.schema.js";
import { 
    createMovementHeaderRepository,   
    getAllMovementsRepository,
    getMovementByIdRepository,
    getProductMovementsRepository,
    getMovementByIdWithRelationsRepository
} from "./movement_header/movement_header.repository.js";
import { bulkCreateMovementLineRepository } from "./movement_line/movement_line.repository.js";
import { getMovementTypeByIdRepository } from './movement_type/movement_type.repository.js';
import { getReasonByIdRepository } from './reason/reason.repository.js';
import { findAssetsByIdsRepository } from '../asset/asset.repository.js';
import {
    findStockForUpdateRepository,
    createStockRepository,
    updateStockRepository
} from '../stock/stock.repository.js';
import { bulkCreateMovementTargetsRepository } from './movement_target/movement_target.repository.js';
import { sequelize } from "#src/config/database.js";

export const getFilteredMovementsServices = async (query) => {
    const filters = {};

    if (query.movement_type) filters.movement_type = query.movement_type;
    if (query.reason) filters.reason = query.reason;
    if (query.warehouse_id) filters.warehouse_id = Number(query.warehouse_id);

    const where = {};

    if(filters.movement_type) where.movement_type = filters.movement_type;
    if(filters.reason) where.reason = filters.reason;
    if (filters.warehouse_id) where.warehouse_id = filters.warehouse_id;

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

    const { count, rows } = await getAllMovementsRepository({
        where,
        limit,
        offset,
        order,
        product_id: query.product_id ? Number(query.product_id) : undefined
    });

    const totalPages = Math.ceil(count / limit);

    return {
        data: rows,
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

export const getMovementByIdService = async (id) => {

    if (!id || isNaN(id)) {
        throw new Error("El id del movimiento es inválido");
    }

    const movement = await getMovementByIdRepository(Number(id));

    if (!movement) {
        throw new Error("Movimiento no encontrado");
    }

    return movement;
};

export const getProductMovementsService = async (product_id, query) => {

    if (!product_id || isNaN(product_id)) {
        throw new Error("El id del producto es inválido");
    }

    const limit = query.limit ? Number(query.limit) : 10;
    const page = query.page ? Number(query.page) : 1;
    const offset = (page - 1) * limit;

    if (isNaN(limit) || limit <= 0) {
        throw new Error('El parámetro limit debe ser un número entero positivo');
    }

    if (isNaN(page) || page <= 0) {
        throw new Error('El parámetro page debe ser un número entero positivo');
    }

    const order = query.order === 'ASC' ? 'ASC' : 'DESC';

    const { count, rows } = await getProductMovementsRepository({
        product_id: Number(product_id),
        limit,
        offset,
        order
    });

    const totalPages = Math.ceil(count / limit);

    return {
        data: rows,
        meta: {
            total: count,
            page,
            limit,
            totalPages,
            hasNextPage: page < totalPages,
            hasPreviousPage: page > 1
        }
    };
};

export const createMovementService = async (payload, userId) => {

    const { 
        movement_type_id,
        reason_id,
        reference,
        note,
        warehouse_from_id,
        warehouse_to_id,
        lines, 
        targets
    } = payload;

    return await sequelize.transaction(async (transaction) => {

        const datetime = new Date();

        console.log("STEP 1: DTO");

        const movementDto = new MovementDto({
            reference,
            datetime,
            note,
            created_by_user_id: userId
        });

        movementDto.validate();

        console.log("STEP 2: Validar FK");

        const movementType = await getMovementTypeByIdRepository(movement_type_id);

        console.log("Movement Type: ", movementType);

        if (!movementType) throw new Error("Tipo de movimiento inválido");

        const reason = await getReasonByIdRepository(reason_id);

        if (!reason) throw new Error("Razón inválida");

        const movement_type = movementType.type;

        console.log("STEP 3: Crear header");

        const header = await createMovementHeaderRepository({
            movement_type_id,
            reason_id,
            reference,
            datetime,
            created_by_user_id: userId,
            note,
            warehouse_from_id,
            warehouse_to_id
        }, transaction);

        const movementLines = lines.map(line => ({
            movement_header_id: header.id,
            product_id: line.product_id,
            quantity: line.quantity
        }));

        console.log("STEP 4: Crear Movement Lines");

        await bulkCreateMovementLineRepository(movementLines, transaction);

        console.log("STEP 5: Crear Movement Targets");

        if (movement_type === 'SALIDA') {

            if (!targets || !Array.isArray(targets) || targets.length === 0) {
                throw new Error("Las salidas deben tener al menos un asset destino");
            }

            const assetIds = targets.map(t => t.asset_id);

            if (assetIds.some(id => !id)) {
                throw new Error("Todos los targets deben tener asset_id");
            }

            // 🔹 Validar existencia (sin lógica DB directa)
            const assets = await findAssetsByIdsRepository(assetIds, transaction);

            if (assets.length !== assetIds.length) {
                throw new Error("Uno o más assets no existen");
            }

            // 🔹 Preparar data (sin DB aún)
            const movementTargets = assetIds.map(asset_id => ({
                movement_header_id: header.id,
                asset_id
            }));

            // 🔹 Persistir (delegado al repository)
            await bulkCreateMovementTargetsRepository(movementTargets, transaction);
        }

        console.log("STEP 6: Calcular deltas");

        const calculateDeltas = ({
            movement_type,
            warehouse_from_id,
            warehouse_to_id,
            lines
        }) => {

            const deltas = [];

            for (const line of lines) {

                const { product_id, quantity } = line;

                if (movement_type === 'ENTRADA') {

                    if (!warehouse_to_id)
                        throw new Error("Las entradas deben ir a un almacén");

                    if (warehouse_from_id)
                        throw new Error("Las entradas no deben venir de un almacén");

                    deltas.push({
                        product_id,
                        warehouse_id: warehouse_to_id,
                        delta: quantity
                    });
                }

                if (movement_type === 'SALIDA') {

                    if (!warehouse_from_id)
                        throw new Error("Las salidas deben venir de un almacén");

                    if (warehouse_to_id)
                        throw new Error("Las salidas no pueden ir a un almacén");

                    deltas.push({
                        product_id,
                        warehouse_id: warehouse_from_id,
                        delta: -quantity
                    });
                }

                if (movement_type === 'TRANSFERENCIA') {

                    if (!warehouse_from_id)
                        throw new Error("Las transferencias deben salir de un almacén");

                    if (!warehouse_to_id)
                        throw new Error("Las transferencias deben ir a un almacén");

                    deltas.push({
                        product_id,
                        warehouse_id: warehouse_from_id,
                        delta: -quantity
                    });

                    deltas.push({
                        product_id,
                        warehouse_id: warehouse_to_id,
                        delta: quantity
                    });
                }

                if (movement_type === 'AJUSTE') {

                    if (!warehouse_from_id)
                        throw new Error("Los ajustes deben hacerse sobre un almacén");

                    deltas.push({
                        product_id,
                        warehouse_id: warehouse_from_id,
                        delta: quantity
                    });
                }
            }

            return deltas;
        };

        const deltas = calculateDeltas({
            movement_type,
            warehouse_from_id,
            warehouse_to_id,
            lines
        });

        console.log("STEP 6: Aplicar stock");
        const applyStockDelta = async (delta, transaction) => {

            const { product_id, warehouse_id, delta: quantityDelta } = delta;

            let stock = await findStockForUpdateRepository(
                product_id,
                warehouse_id,
                transaction
            );

            if (!stock) {

                if (quantityDelta < 0)
                    throw new Error("No existe stock para el producto y almacén especificados");

                return await createStockRepository({
                    product_id,
                    warehouse_id,
                    quantity: quantityDelta
                }, transaction);
            }

            const newQuantity = stock.quantity + quantityDelta;

            if (newQuantity < 0)
                throw new Error("Stock insuficiente para aplicar el movimiento");

            await updateStockRepository(stock, newQuantity, transaction);
        };

        for (const delta of deltas) {
            await applyStockDelta(delta, transaction);
        }

        const movement = await getMovementByIdWithRelationsRepository(
            header.id,
            transaction
        );

        return movement;
    });
};