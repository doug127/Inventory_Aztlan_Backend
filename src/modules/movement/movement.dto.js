export const movementDTO = (movement) => {
    const m = movement.get ? movement.get() : movement;

    return {
        id: m.id,
        movement_type_id: m.movement_type_id,
        reason_id: m.reason_id,
        reference: m.reference,
        datetime: m.datetime,
        created_by_user_id: m.created_by_user_id,
        warehouse_from_id: m.warehouse_from_id,
        warehouse_to_id: m.warehouse_to_id,
        note: m.note,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,

        movement_targets: m.movement_targets?.map(target => ({
            id: target.id,
            asset: target.asset ? {
                id: target.asset.id,
                name: target.asset.name,
                asset_type: target.asset.asset_type ? {
                    id: target.asset.asset_type.id,
                    name: target.asset.asset_type.name
                } : null
            } : null
        })) ?? [],

        movement_lines: m.movement_lines?.map(line => ({
            id: line.id,
            product_id: line.product_id,
            quantity: line.quantity
        })) ?? []
    };
};