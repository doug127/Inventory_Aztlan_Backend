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
        attributes: ['id', 'quantity', 'note'],
        include: [
            {
                model: Product,
                attributes: ['id', 'name']
            }
        ]
    };

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
                attributes: ['id', 'type']
            },
            {
                model: Reason,
                attributes: ['id', 'type']
            },
            movementLineInclude,
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
                as:'warehouse_from',
                attributes: ['id', 'code', 'name']
            },
            {
                model: Warehouse,
                as: 'warehouse_to',
                attributes: ['id', 'code', 'name']
            },
            {
                model: User,
                attributes: ['id', 'username']
            }
        ],
        limit,
        offset,
        order: [['id', order]], // o [['createdAt', order]] si prefieres por fecha
    };
  
    const { count, rows } = await MovementHeader.findAndCountAll(options);
    return { count, rows };
};

export const getMovementByIdRepository = async (id) => {
    const movement = await MovementHeader.findByPk(id, {
        attributes: [
            'id',
            'reference',
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
                model: MovementLine,
                attributes: ['id', 'quantity', 'note'],
                include: [
                    {
                        model: Product,
                        attributes: ['id', 'name']
                    }
                ]
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
                as:'warehouse_from',
                attributes: ['id', 'code', 'name']
            },
            {
                model: Warehouse,
                as: 'warehouse_to',
                attributes: ['id', 'code', 'name']
            },
            {
                model: User,
                attributes: ['id', 'username']
            }
        ]
    });

    return movement;
}

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