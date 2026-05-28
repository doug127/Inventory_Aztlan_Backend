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
import {
  getUnitByIdRepository
} from './unit/unit.repository.js';
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

    if (query.name) filters.name = query.name.trim();
    if (query.category_product)  filters.category_product = query.category_product.trim();
    if (query.unit) filters.unit = query.unit.trim();

    const order = query.order === 'DESC' ? 'DESC' : 'ASC';
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 10;

    if (page < 1) throw new Error( 'El número de página debe ser mayor o igual a 1' );

    if (limit < 1) throw new Error( 'El límite debe ser mayor o igual a 1' );

    const offset = (page - 1) * limit;

    // REPOSITORY

    const { rows, count } =
        await getAllByFilterProductsRepository({
            filters,
            limit,
            offset,
            order
        });

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

    const existingUnit = await getUnitByIdRepository(unit_id);
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

    const existingUnit = await getUnitByIdRepository(unit_id);
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