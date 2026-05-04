import {
  getAllProductsRepository,
  getProductByIdRepository,
  getAllByFilterProductsRepository,
  getProductByNameRepository,
  getProductByCodeRepository,
  getProductByUnitIdRepository,
  createProductRepository,
  updateProductRepository,
  deleteProductRepository
} from './product.repository.js';
import { productDTO } from './product.dto.js';
import { 
    parseNumericRangeFromQuery,
    applyNumericFiltersToWhere,
    getLowerBound,
    getUpperBound,
} from '#src/shared/utils/query.js';

export const getAllProductsService = async () => {
    const products = await getAllProductsRepository();

    const payload = products.map(productDTO);
    
    return payload;
}

export const getProductByIdService = async (id) => {
    const product = await getProductByIdRepository(id);
    
    if (!product) {
        throw new Error('Producto no encontrado');
    }

    const payload = productDTO(product);

    return payload;
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
    
    const payload = rows.map(productDTO);

    return {
        data: payload,
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
    const { name, code, unit_id, min_stock, max_stock } = data;
    console.log('Data recibida en el servicio:', data);
    
    if (min_stock >= max_stock) {
        throw new Error('El stock mínimo no puede ser mayor o igual al stock máximo');
    }

    const existingProductByName = await getProductByNameRepository(name);
    if (existingProductByName) {
        throw new Error('Ya existe un producto con el mismo nombre');
    }

    const existingProductByCode = await getProductByCodeRepository(code);
    if (existingProductByCode) {
        throw new Error('Ya existe un producto con el mismo código');
    }

    const existingUnit = await getProductByUnitIdRepository(unit_id);
    if (!existingUnit) {
        throw new Error('La unidad especificada no existe');
    }

    const newProduct = await createProductRepository(data);
    console.log('Producto creado:', newProduct);
    const payload = productDTO(newProduct);

    return payload;
}

export const updateProductService = async (id, data) => {
    const { name, code, unit_id, min_stock, max_stock } = data;
    
    const existingProduct = await getProductByIdRepository(id);
    if (!existingProduct) {
        throw new Error('Producto no encontrado');
    }

    const existingProductByName = await getProductByNameRepository(name);
    if (existingProductByName && existingProductByName.id !== id) {
        throw new Error('Ya existe un producto con el mismo nombre');
    }

    if (min_stock >= max_stock) {
        throw new Error('El stock mínimo no puede ser mayor o igual al stock máximo');
    }
    const existingProductWithCode = await getProductByCodeRepository(code);
    if (existingProductWithCode && existingProductWithCode.id !== id) {
        throw new Error('Ya existe un producto con el mismo código');
    }

    const existingUnit = await getProductByUnitIdRepository(unit_id);
    if (!existingUnit) {
        throw new Error('La unidad especificada no existe');
    }

    const updatedProduct = await updateProductRepository(id, data);

    const payload = productDTO(updatedProduct);
    
    return payload;
}

export const deleteProductService = async (id) => {
    const existingProduct = await getProductByIdRepository(id);
    if (!existingProduct) {
        throw new Error('Producto no encontrado');
    }
    return await deleteProductRepository(id);
}