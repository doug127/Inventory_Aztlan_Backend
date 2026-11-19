// Productos (HU-204, business_rules.md §6.4, naming_conventions.md §6.2).
//  1. El código es {código de categoría}-{NNNN}. Si no se indica, se asigna el siguiente de la
//     categoría (LUBR-0002 es el último → LUBR-0003), con un candado por categoría.
//  2. min_stock ≤ max_stock cuando ambos están definidos.
//  3. No cambia la unidad de un producto con movimientos (cambiaría la lectura de su historial).
//  4. Solo se desactiva con stock 0 en todos los almacenes.
// La categoría y la unidad deben estar activas; se bloquean FOR SHARE para que no se desactiven
// mientras se registra el producto. Consultar es para todos los roles; crear, editar y desactivar,
// para ADMIN o superior (lo exige la ruta).
import Decimal from 'decimal.js';
import { AppError } from '#src/shared/errors/AppError.js';
import { withTransaction } from '#src/shared/db/transaction.js';
import { assertCategoryAvailable, getSubtreeIds } from './product_category/product_category.service.js';
import { assertUnitAvailable } from './unit/unit.service.js';
import * as productRepository from './product.repository.js';
import { toProductDto } from './product.dto.js';

export const PRODUCT_CODE_PATTERN = /^[A-Z]{4}-[0-9]{4}$/;
const MAX_SEQUENCE = 9999;

const fieldIssue = (path, message) => ({ location: 'body', path, message });
const validationError = (path, message) => new AppError('VALIDATION_ERROR', { message, details: [fieldIssue(path, message)] });

const findProductOrFail = async (id, options) => {
  const product = await productRepository.findProductById(id, options);
  if (!product) throw new AppError('NOT_FOUND', { message: `Producto ${id} no encontrado` });
  return product;
};

/** Regla 1: formato CATE-NNNN y prefijo igual al código de la categoría. */
const assertCodeForCategory = (code, category) => {
  let message = null;
  if (!PRODUCT_CODE_PATTERN.test(code)) message = `El código debe tener el formato ${category.code}-0001: código de categoría, guion y 4 dígitos`;
  else if (!code.startsWith(`${category.code}-`)) message = `El código debe empezar por ${category.code}-, el código de su categoría`;
  if (message) throw new AppError('INVALID_CODE_FORMAT', { message, details: [fieldIssue('code', message)] });
};

/** Siguiente código libre de la categoría. Dentro de una transacción con lockCodeSequence. */
const nextCodeFor = async (category, { transaction } = {}) => {
  const last = await productRepository.findLastSequence(category.code, { transaction });
  if (last >= MAX_SEQUENCE) throw validationError('code', `La categoría ${category.code} ya usó los ${MAX_SEQUENCE} códigos disponibles`);
  return `${category.code}-${String(last + 1).padStart(4, '0')}`;
};

/** Regla 2: min_stock ≤ max_stock (max_stock null = sin máximo). */
const assertStockRange = (minStock, maxStock) => {
  if (maxStock !== null && new Decimal(minStock).gt(maxStock)) {
    throw validationError('maxStock', 'El stock máximo no puede ser menor que el mínimo');
  }
};

const assertUniqueFields = async ({ code, name }, { excludeId, transaction } = {}) => {
  const taken = await productRepository.findTakenFields({ code, name }, { excludeId, transaction });
  const details = [];
  if (taken.code) details.push(fieldIssue('code', `Ya existe un producto con el código ${code}`));
  if (taken.name) details.push(fieldIssue('name', 'Ya existe un producto con ese nombre'));
  if (details.length) throw new AppError('DUPLICATE_CODE', { message: details.map((d) => d.message).join('. '), details });
};

const sameQuantity = (a, b) => (a === null || b === null ? a === b : new Decimal(a).eq(b));

// --- Consultas ---------------------------------------------------------------

/** Lista paginada. categoryId incluye sus subcategorías (user_flow.md §4). */
export const listProducts = async (query) => {
  const { page, limit, search, sort, order, isActive, categoryId, unitId } = query;
  const categoryIds = categoryId ? await getSubtreeIds(categoryId) : undefined;
  const { items, total } = await productRepository.listProducts({ ...query, categoryIds });
  return {
    items: items.map(toProductDto),
    total,
    page,
    limit,
    search: search ?? null,
    filters: Object.fromEntries(Object.entries({ isActive, categoryId, unitId }).filter(([, v]) => v !== undefined)),
    sort: { field: sort, order },
  };
};

export const getProduct = async (id) => toProductDto(await findProductOrFail(id));

/** Código sugerido para un producto nuevo de la categoría (el formulario lo muestra en vivo). */
export const getNextCode = async ({ categoryId }) =>
  withTransaction(async (transaction) => {
    const category = await assertCategoryAvailable(categoryId, { transaction });
    return { categoryId: category.id, categoryCode: category.code, code: await nextCodeFor(category, { transaction }) };
  });

// --- Alta, edición y estado ----------------------------------------------------

export const createProduct = async ({ code, name, categoryId, unitId, minStock, maxStock }) => {
  assertStockRange(minStock, maxStock);
  const created = await withTransaction(async (transaction) => {
    const category = await assertCategoryAvailable(categoryId, { transaction });
    await assertUnitAvailable(unitId, { transaction });
    let finalCode = code;
    if (finalCode) assertCodeForCategory(finalCode, category);
    else {
      await productRepository.lockCodeSequence(category.id, { transaction });
      finalCode = await nextCodeFor(category, { transaction });
    }
    await assertUniqueFields({ code: finalCode, name }, { transaction });
    return productRepository.createProduct(
      { code: finalCode, name, productCategoryId: category.id, unitId, minStock, maxStock },
      { transaction }
    );
  });
  return toProductDto(await findProductOrFail(created.id));
};

/**
 * Edición. El nombre y el mínimo/máximo se corrigen siempre. Si el producto ya tiene movimientos:
 *  - no cambia su unidad (regla 3, UNIT_CHANGE_FORBIDDEN);
 *  - no cambian su código ni su categoría: el código aparece en las órdenes impresas y en el
 *    historial, y debe empezar por el código de la categoría (HAS_DEPENDENCIES).
 * Sin movimientos, cambiar de categoría asigna el siguiente código de la nueva, salvo que se
 * indique uno.
 */
export const updateProduct = async (id, changes) => {
  const product = await findProductOrFail(id);
  const update = {};

  if (changes.name !== undefined && changes.name !== product.name) update.name = changes.name;

  const minStock = changes.minStock ?? product.minStock;
  const maxStock = changes.maxStock === undefined ? product.maxStock : changes.maxStock;
  assertStockRange(minStock, maxStock);
  if (!sameQuantity(minStock, product.minStock)) update.minStock = minStock;
  if (!sameQuantity(maxStock, product.maxStock)) update.maxStock = maxStock;

  const unitChanges = changes.unitId !== undefined && changes.unitId !== product.unitId;
  const categoryChanges = changes.categoryId !== undefined && changes.categoryId !== product.productCategoryId;
  const codeChanges = changes.code !== undefined && changes.code !== product.code;

  if (!unitChanges && !categoryChanges && !codeChanges && !Object.keys(update).length) return toProductDto(product);

  await withTransaction(async (transaction) => {
    await findProductOrFail(id, { transaction, lock: 'update' });
    const withHistory = (unitChanges || categoryChanges || codeChanges) && (await productRepository.hasMovements(id, { transaction }));

    if (unitChanges) {
      if (withHistory) {
        const message = `No se puede cambiar la unidad de ${product.code}: ya tiene movimientos registrados en ${product.unit.code}`;
        throw new AppError('UNIT_CHANGE_FORBIDDEN', { message, details: [fieldIssue('unitId', message)] });
      }
      await assertUnitAvailable(changes.unitId, { transaction });
      update.unitId = changes.unitId;
    }

    if ((categoryChanges || codeChanges) && withHistory) {
      const path = codeChanges ? 'code' : 'categoryId';
      const message = `No se puede cambiar ${codeChanges ? 'el código' : 'la categoría'} de ${product.code}: ya aparece en movimientos registrados`;
      throw new AppError('HAS_DEPENDENCIES', { message, details: [fieldIssue(path, message)] });
    }

    let category = product.category;
    if (categoryChanges) {
      category = await assertCategoryAvailable(changes.categoryId, { transaction });
      update.productCategoryId = category.id;
    }
    if (codeChanges) {
      assertCodeForCategory(changes.code, category);
      update.code = changes.code;
    } else if (categoryChanges) {
      // El código sigue a la categoría: FERT-0001 movido a HERB pasa a ser el siguiente de HERB.
      await productRepository.lockCodeSequence(category.id, { transaction });
      update.code = await nextCodeFor(category, { transaction });
    }

    await assertUniqueFields({ code: update.code, name: update.name }, { excludeId: product.id, transaction });
    await productRepository.updateProduct(product.id, update, { transaction });
  });

  return toProductDto(await findProductOrFail(product.id));
};

/**
 * Regla 4: solo se desactiva con stock 0 en todos los almacenes. Se cuenta con el producto
 * bloqueado FOR UPDATE: un movimiento lo bloquea FOR SHARE (assertProductAvailable), así que uno
 * espera al otro.
 */
export const deactivateProduct = async (id) => {
  const product = await findProductOrFail(id);
  if (!product.isActive) return toProductDto(product);

  await withTransaction(async (transaction) => {
    await findProductOrFail(id, { transaction, lock: 'update' });
    const warehouses = await productRepository.countWarehousesWithStock(id, { transaction });
    if (warehouses > 0) {
      throw new AppError('HAS_STOCK', {
        message: `No se puede desactivar ${product.code}: tiene existencias en ${warehouses} ${warehouses === 1 ? 'almacén' : 'almacenes'}. Retírelas, trasládelas o ajústelas a 0 primero.`,
        details: { productCode: product.code, warehousesWithStock: warehouses },
      });
    }
    await productRepository.updateProduct(id, { isActive: false }, { transaction });
  });

  return toProductDto(await findProductOrFail(id));
};

/** Solo se reactiva si su categoría y su unidad están activas. */
export const activateProduct = async (id) => {
  const product = await findProductOrFail(id);
  if (product.isActive) return toProductDto(product);
  for (const [ref, label] of [[product.category, 'la categoría'], [product.unit, 'la unidad']]) {
    if (!ref.isActive) {
      throw new AppError('INACTIVE_RESOURCE', { message: `Active primero ${label} ${ref.code}`, details: { code: ref.code } });
    }
  }
  await productRepository.updateProduct(id, { isActive: true });
  return toProductDto(await findProductOrFail(id));
};

/**
 * Para el service de movimientos (Sprints 5 y 6): el producto existe y está activo
 * (business_rules.md §3.5), y queda bloqueado FOR SHARE para que no se desactive ni cambie de
 * unidad mientras se registra el movimiento.
 */
export const assertProductAvailable = async (id, { transaction }) => {
  const product = await productRepository.findProductById(id, { transaction, lock: 'share' });
  if (!product) throw new AppError('NOT_FOUND', { message: `El producto ${id} no existe` });
  if (!product.isActive) {
    throw new AppError('INACTIVE_RESOURCE', {
      message: `El producto ${product.code} está desactivado: no admite movimientos nuevos`,
      details: { productCode: product.code },
    });
  }
  return product;
};
