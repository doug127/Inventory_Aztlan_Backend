import { 
    MovementHeader, 
    MovementLine, 
    Product, 
    User, 
    Warehouse,
    MovementType,
    Reason,
    MovementTarget,
    Asset,
    AssetType
} from '#src/database/models/index.model.js';

const getMovementsHeadersRepository = async ({ where, limit, offset, order }) => {
    const options = {
        where,
        attributes: ['id', 'reference', 'datetime', 'note'],
        include: [
            {
                model: MovementType,
                attributes: ['id', 'type']
            },
            {
                model: Reason,
                attributes: ['id', 'type']
            },
            {
                model: User,
                attributes: ['fullname']
            },
            {
                model: Warehouse,
                as: 'warehouse_from',
                attributes: ['name']
            },
            {
                model: Warehouse,
                as: 'warehouse_to',
                attributes: ['name']
            },
            {
                model: MovementTarget,
                attributes: ['id'],
                required: false,
                include: [
                    {
                        model: Asset,
                        attributes: ['id', 'name'],
                        include: [
                            {
                                model: AssetType,
                                attributes: ['id', 'name']
                            }
                        ]
                    }
                ]
            }
        ],
        limit,
        offset,
        order: [['id', order]]
    };
    
    const { count, rows } = await MovementHeader.findAndCountAll(options);
    return { count, rows };
}

export const getAllMovementsRepository = async ({ where, limit, offset, order, product_id }) => {

    const movementLineInclude = {
        model: MovementLine,
        as: 'movement_lines',
        attributes: ['id', 'quantity', 'note'],
        include: [
            {
                model: Product,
                as: 'product',
                attributes: ['id', 'name']
            }
        ]
    };

    // 🔥 filtro por producto (se mantiene igual)
    if (product_id) {
        movementLineInclude.where = { product_id };
        movementLineInclude.required = true;
    }

    const options = {
        where,
        attributes: ['id', 'reference', 'datetime', 'note'],
        include: [
            {
                model: MovementType,
                as: 'movement_type',
                attributes: ['id', 'type']
            },
            {
                model: Reason,
                as: 'reason',
                attributes: ['id', 'type']
            },
            movementLineInclude,
            {
                model: MovementTarget,
                as: 'movement_targets',
                attributes: ['id'],
                required: false,
                include: [
                    {
                        model: Asset,
                        as: 'asset',
                        attributes: ['id', 'name'],
                        include: [
                            {
                                model: AssetType,
                                as: 'asset_type',
                                attributes: ['id', 'name']
                            }
                        ]
                    }
                ]
            },
            {
                model: Warehouse,
                as: 'warehouse_from',
                attributes: ['id', 'code', 'name']
            },
            {
                model: Warehouse,
                as: 'warehouse_to',
                attributes: ['id', 'code', 'name']
            },
            {
                model: User,
                as: 'user',
                attributes: ['id', 'username']
            }
        ],
        limit,
        offset,
        order: [['id', order]]
    };

    const { count, rows } = await MovementHeader.findAndCountAll(options);

    return { count, rows };
}; 

export const getMovementByIdRepository = async (id) => {
    return await MovementHeader.findByPk(id, {
        attributes: ['id', 'reference', 'datetime', 'note'],
        include: [
            {
                model: MovementType,
                as: 'movement_type',
                attributes: ['id', 'type']
            },
            {
                model: Reason,
                as: 'reason',
                attributes: ['id', 'type']
            },
            {
                model: User,
                as: 'user',
                attributes: ['id', 'username']
            },
            {
                model: Warehouse,
                as: 'warehouse_from',
                attributes: ['id', 'code', 'name']
            },
            {
                model: Warehouse,
                as: 'warehouse_to',
                attributes: ['id', 'code', 'name']
            },
            {
                model: MovementLine,
                as: 'movement_lines',
                attributes: ['id', 'quantity'],
                include: [
                    {
                        model: Product,
                        as: 'product',
                        attributes: ['id', 'name']
                    }
                ]
            },
            {
                model: MovementTarget,
                as: 'movement_targets',
                required: false,
                attributes: ['id'],
                include: [
                    {
                        model: Asset,
                        as: 'asset',
                        attributes: ['id', 'name'],
                        include: [
                            {
                                model: AssetType,
                                as: 'asset_type',
                                attributes: ['id', 'name']
                            }
                        ]
                    }
                ]
            }
        ]
    });
};

export const getProductMovementsRepository = async ({
    product_id,
    limit,
    offset,
    order
}) => {
    const options = {
        attributes: [
            'id',
            'datetime',
            'note'
        ],
        include: [
            {
                model: MovementType,
                attributes: ['id', 'type']
            },
            {
                model: Reason,
                attributes: ['id', 'type']
            },
            {
                model: User,
                attributes: ['id', 'username']
            },
            {
                model: MovementLine,
                attributes: ['quantity'],
                where: { product_id },
                required: true
            },
            {
                model: MovementTarget,
                attributes: ['id'],
                required: false, 
                include: [
                    {
                        model: Asset,
                        attributes: ['id', 'name'],
                        include: [
                            {
                                model: AssetType,
                                attributes: ['id', 'name']
                            }
                        ]
                    }
                ]
            },
            {
                model: Warehouse,
                as: 'warehouse_from',
                attributes: ['id', 'name']
            },
            {
                model: Warehouse,
                as: 'warehouse_to',
                attributes: ['id', 'name']
            }
        ],
        limit,
        offset,
        order: [['datetime', order]]
    };

    const { count, rows } = await MovementHeader.findAndCountAll(options);

    return { count, rows };
}

export const createMovementHeaderRepository = async (data, transaction) => {
    console.log("data.movement_type: ", data.movement_type);
    return await MovementHeader.create(data, { transaction });
}

export const getMovementByIdWithRelationsRepository = async (id, transaction) => {
    return await MovementHeader.findByPk(id, {
        include: [
            {
                model: MovementTarget,
                attributes: ['id'],
                include: [
                    {
                        model: Asset,
                        attributes: [
                            'id',
                            'name'
                        ],
                        include: [
                            {
                                model: AssetType,
                                attributes: [
                                    'id',
                                    'name'
                                ]
                            }
                        ]
                    }
                ]
            },
            {
                model: MovementLine,
                attributes: [
                    'id',
                    'product_id',
                    'quantity'
                ]
            }
        ],
        transaction
    });
};