import { Product, Unit, CategoryProduct} from '#src/database/models/index.model.js';
import { Op } from 'sequelize';

export const getAllProductsRepository = async () => {
    return await Product.findAll({
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
        ],
        order: [['name', 'ASC']]
    });
};

export const getAllByFilterProductsRepository = async ({
    filters,
    limit,
    offset,
    order
}) => {

    const where = {};

    if (filters.name) where.name = { [Op.iLike]: `%${filters.name}%` };
    if (filters.code) where.code = { [Op.iLike]: `%${filters.code}%` };
    if (filters.content_quantity) where.content_quantity = filters.content_quantity; 
    if (filters.min_stock) where.min_stock = filters.min_stock; 
    if (filters.max_stock) where.max_stock = filters.max_stock;

    const include = [
        {
            model: Unit,
            as: 'unit',
            required: !!filters.unit,
            where: filters.unit
                ? { name: { [Op.iLike]: `%${filters.unit}%`} }
                : undefined
        },
        {
            model: CategoryProduct,
            as: 'category_product',
            required: !!filters.category_product,
            where: filters.category_product
                ? { name: { [Op.iLike]: `%${filters.category_product}%` }}
                : undefined
        }
    ];
    return Product.findAndCountAll({
        where,
        include,
        limit,
        offset,
        distinct: true,
        order: [ ['name', order] ]
    });
};

export const getProductByIdRepository = async (id) => {
    return await Product.findByPk(id, {
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
    });
};

export const getProductByNameRepository = async (name) => {
    return await Product.findOne({
        where: { name },
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
    });
};

export const getProductByCodeRepository = async (code) => {
    return await Product.findOne({
        where: { code },
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
    });
};

export const getProductByUnitIdRepository = async (unit_id) => {
    return await Product.findOne({
        where: { unit_id },
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
    });
};

export const createProductRepository = async (data) => {
    console.log('Creando producto con datos:', data);
    const created = await Product.create(data);
    return await Product.findByPk(created.id, {
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
    });
};

export const updateProductRepository = async (id, updates) => {
    const product = await Product.findByPk(id);
    if (!product) return null;
    const updated = await product.update(updates);
    return await Product.findByPk(updated.id, {
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