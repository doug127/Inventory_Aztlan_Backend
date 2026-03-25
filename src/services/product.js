import {
  getAllProductsRepository,
  getProductByIdRepository,
  getAllByFilterProductsRepository,
  createProductRepository,
  updateProductRepository,
  deleteProductRepository
} from '../repositories/product.js';
import { ProductDTO } from '../dtos/product.js';
import { 
    parseNumericRangeFromQuery,
    applyNumericFiltersToWhere,
    getLowerBound,
    getUpperBound,
} from '../utils/query.js';

export const getAllProductsService = async () => {
    return await getAllProductsRepository();
}

export const getProductByIdService = async (id) => {
    const product = await getProductByIdRepository(id);
    if (!product) {
        throw new Error('Producto no encontrado');
    }
    return product;
}

export const getAllByFilterProductsService = async (query) => {
    
    const filters = {};

    filters.min_stock = parseNumericRangeFromQuery(query, 'min_stock');
    filters.max_stock = parseNumericRangeFromQuery(query, 'max_stock');
    filters.content_quantity = parseNumericRangeFromQuery(query, 'content_quantity');

    if (query.name) filters.name = query.name.trim();
    if (query.code) filters.code = query.code.trim().toUpperCase();

    if (query.category_product_id) filters.category_product_id = Number(query.category_product_id);
    if (query.unit_id) filters.unit_id = Number(query.unit_id);

    const minLower = getLowerBound(filters.min_stock);
    const maxUpper = getUpperBound(filters.max_stock);

    if (minLower !== null && maxUpper !== null && minLower >= maxUpper) {
        throw new Error('El stock mínimo no puede ser mayor o igual al stock máximo');
    }

    const where = {};

    if (filters.name) where.name = { [Op.iLike]: `%${filters.name}%` };
    if (filters.code) where.code = { [Op.iLike]: `%${filters.code}%` };
    if (filters.category_product_id) where.product_category_id = filters.category_product_id;
    if (filters.unit_id) where.unit_id = filters.unit_id;
    
    // aplicar rangos numéricos
    applyNumericFiltersToWhere(where, filters.content_quantity, 'content_quantity');
    applyNumericFiltersToWhere(where, filters.min_stock, 'min_stock');
    applyNumericFiltersToWhere(where, filters.max_stock, 'max_stock');

    // Paginación
    const order = query.order === 'DESC' ? 'DESC' : 'ASC';
    const page = Number(query.page) || 1; 
    const limit = Number(query.limit) || 10; 
    
    if(page < 1) throw new Error('El número de página debe ser mayor o igual a 1');
    if(limit < 1) throw new Error('El límite de resultados por página debe ser mayor o igual a 1');

    const offset = (page - 1) * limit;

    const { rows, count } = await getAllByFilterProductsRepository({ where, limit, offset, order });
    
    return {
        data: rows,
        meta: {
            total: count,
            page,
            limit,
            totalPages: Math.ceil(count / limit),
            hasNextPage: page < Math.ceil(count / limit),
            hasPreviousPage: page > 1
        }
    };
}

export const createProductService = async (data) => {
    console.log('Datos recibidos para crear producto:', data);

    const productDTO = new ProductDTO(data);
    productDTO.validate();

    return await createProductRepository(data);
}

export const updateProductService = async (id, data) => {
    const existingProduct = await getProductByIdRepository(id);
    if (!existingProduct) {
        throw new Error('Producto no encontrado');
    }
    return await updateProductRepository(id, data);
}

export const deleteProductService = async (id) => {
    const existingProduct = await getProductByIdRepository(id);
    if (!existingProduct) {
        throw new Error('Producto no encontrado');
    }
    return await deleteProductRepository(id);
}