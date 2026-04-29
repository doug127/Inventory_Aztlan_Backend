import { Product, Unit, CategoryProduct} from '#src/database/models/index.model.js';

export const getAllProductsRepository = async () => {
    return await Product.findAll({
        attributes: ['name', 'code', 'content_quantity', 'min_stock', 'max_stock'],
        include: [
            {
                model: Unit,
                attributes: ['name', 'code']
            },
            {   
                model: CategoryProduct,
                attributes: ['name']
            } 
        ],
        order: [['name', 'ASC']]
    });
};

export const getAllByFilterProductsRepository = async ({where, limit, offset, order}) => {
    return await Product.findAndCountAll({
        where,
        attributes: ['name', 'code', 'content_quantity', 'min_stock', 'max_stock', 'is_active'],
        include: [
            {
                model: Unit,
                attributes: ['name', 'code']
            },
            {
                model: CategoryProduct,
                attributes: ['name']
            }
        ],
        limit,
        offset,
        order: [['name', order]]
    });
};    

export const getProductByIdRepository = async (id) => {
    return await Product.findByPk(id, {
        attributes: ['name', 'code', 'content_quantity', 'min_stock', 'max_stock'],
        include: [
            {
                model: Unit,
                attributes: ['name', 'code']
            },
            {
                model: CategoryProduct,
                attributes: ['name']
            }
        ]
    });
};

export const getProductByCodeRepository = async (code) => {
    return await Product.findOne({
        where: { code },
        attributes: ['name', 'code', 'content_quantity', 'min_stock', 'max_stock'],
        include: [
            {
                model: Unit,
                attributes: ['name', 'code']
            },
            {
                model: CategoryProduct,
                attributes: ['name']
            }
        ]
    });
};

export const createProductRepository = async (data) => {
    console.log('Creando producto con datos:', data);
    const created = await Product.create(data);
    return await Product.findByPk(created.id, {
        attributes: ['name', 'code', 'content_quantity', 'min_stock', 'max_stock'],
        include: [
            {
                model: Unit,
                attributes: ['name', 'code']
            },
            {   
                model: CategoryProduct,
                attributes: ['name']
            } 
        ]
    });
};

export const updateProductRepository = async (id, updates) => {
    const product = await Product.findByPk(id);
    if (!product) return null;
    const updated = await product.update(updates);
    return await Product.findByPk(updated.id, {
        attributes: ['name', 'code', 'content_quantity', 'min_stock', 'max_stock'],
        include: [
            {
                model: Unit,
                attributes: ['name', 'code']
            },
            {   
                model: CategoryProduct,
                attributes: ['name']
            } 
        ]
    });
};

export const deleteProductRepository = async (id) => {
    const [updated] = await Product.update(
        { is_active: false }, 
        { where: { id } }
    );
    if(!updated) return null;
    return await Product.findByPk(id);
};