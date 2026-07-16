export const calculateDeltas = ({
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
