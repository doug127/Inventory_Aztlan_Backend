// Categorías de productos en árbol (HU-203, business_rules.md §6.2, naming_conventions.md §6.1).
//  1. Sin ciclos: al cambiar el padre, el nuevo padre no puede ser la categoría ni una de sus
//     descendientes (CTE recursivo). Los cambios de padre se serializan con un candado.
//  2. El nombre es único dentro del mismo padre; el código (4 letras) es único en todo el catálogo.
//  3. No se desactiva una categoría con hijas activas o con productos activos.
// Solo las raíces llevan icono (HU-301); las subcategorías muestran el de su raíz.
// El código es el prefijo de los productos (LUBR → LUBR-0001): no cambia si la categoría tiene productos.
// Consultar es para todos los roles; crear, editar, mover y desactivar, para ADMIN o superior (lo exige la ruta).
import { AppError } from '#src/shared/errors/AppError.js';
import { withTransaction } from '#src/shared/db/transaction.js';
import { buildCategoryTree, resolveCategoryIcon } from '#src/shared/utils/categoryTree.js';
import * as categoryRepository from './product_category.repository.js';
import { toCategoryDetailDto, toCategoryDto, toCategoryTreeDto } from './product_category.dto.js';

export const CATEGORY_CODE_PATTERN = /^[A-Z]{4}$/;

const fieldIssue = (path, message) => ({ location: 'body', path, message });
const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

const findCategoryOrFail = async (id, options) => {
  const category = await categoryRepository.findCategoryById(id, options);
  if (!category) throw new AppError('NOT_FOUND', { message: `Categoría ${id} no encontrada` });
  return category;
};

const assertCodeFormat = (code) => {
  if (!CATEGORY_CODE_PATTERN.test(code)) {
    const message = 'El código debe tener exactamente 4 letras de la A a la Z (ej. LUBR, FERT)';
    throw new AppError('INVALID_CODE_FORMAT', { message, details: [fieldIssue('code', message)] });
  }
};

/** Regla 2. Se verifica antes para responder por campo; el UNIQUE de la BD cubre las carreras. */
const assertUniqueFields = async ({ code, name, parentId }, { excludeId, transaction } = {}) => {
  const taken = await categoryRepository.findTakenFields({ code, name, parentId }, { excludeId, transaction });
  const details = [];
  if (taken.code) details.push(fieldIssue('code', `Ya existe una categoría con el código ${code}`));
  if (taken.name) {
    details.push(fieldIssue('name', parentId ? 'Ya existe una subcategoría con ese nombre en la misma categoría' : 'Ya existe una categoría raíz con ese nombre'));
  }
  if (details.length) throw new AppError('DUPLICATE_CODE', { message: details.map((d) => d.message).join('. '), details });
};

/**
 * El padre existe y está activo. Se bloquea FOR SHARE: mientras se crea o se mueve una hija, nadie
 * puede desactivar al padre (deactivateCategory lo bloquea FOR UPDATE).
 */
const assertParentAvailable = async (parentId, { transaction }) => {
  const parent = await categoryRepository.findCategoryById(parentId, { transaction, lock: 'share' });
  if (!parent) {
    const message = `La categoría padre ${parentId} no existe`;
    throw new AppError('VALIDATION_ERROR', { message, details: [fieldIssue('parentId', message)] });
  }
  if (!parent.isActive) {
    throw new AppError('INACTIVE_RESOURCE', {
      message: `La categoría ${parent.code} está desactivada: no admite subcategorías`,
      details: [fieldIssue('parentId', `${parent.code} está desactivada`)],
    });
  }
  return parent;
};

/** Regla 1: el nuevo padre no puede ser la propia categoría ni ninguna de sus descendientes. */
const assertNoCycle = async (category, parentId, { transaction }) => {
  const subtree = parentId === category.id ? [category.id] : await categoryRepository.findSubtreeIds(category.id, { transaction });
  if (!subtree.includes(parentId)) return;
  const message =
    parentId === category.id
      ? `${category.code} no puede ser su propia categoría padre`
      : `No se puede mover ${category.code} dentro de una de sus propias subcategorías`;
  throw new AppError('CATEGORY_CYCLE', { message, details: [fieldIssue('parentId', message)] });
};

// --- Consultas ---------------------------------------------------------------

export const listCategories = async (query) => {
  const { page, limit, search, sort, order, isActive, parentId, root } = query;
  const { items, total } = await categoryRepository.listCategories(query);
  return {
    items: items.map(toCategoryDto),
    total,
    page,
    limit,
    search: search ?? null,
    filters: Object.fromEntries(Object.entries({ isActive, parentId, root }).filter(([, v]) => v !== undefined)),
    sort: { field: sort, order },
  };
};

/** Árbol completo: raíces ordenadas por nombre, cada nodo con sus hijas en `children`. */
export const getCategoryTree = async ({ isActive } = {}) =>
  toCategoryTreeDto(buildCategoryTree(await categoryRepository.findAllCategories(), { isActive, countOf: (row) => row.totalProducts }));

/** Ficha: la categoría, su ruta desde la raíz y sus hijas directas. */
export const getCategory = async (id) => {
  const category = await findCategoryOrFail(id);
  const [path, children] = await Promise.all([categoryRepository.findAncestors(id), categoryRepository.findChildren(id)]);
  return toCategoryDetailDto(category, { path, children });
};

/**
 * Ids de la categoría y todas sus subcategorías. Para los filtros que "incluyen subcategorías"
 * (existencias HU-407, reportes HU-501).
 */
export const getSubtreeIds = async (id, { transaction } = {}) => {
  const ids = await categoryRepository.findSubtreeIds(id, { transaction });
  if (!ids.length) throw new AppError('NOT_FOUND', { message: `Categoría ${id} no encontrada` });
  return ids;
};

// --- Alta, edición y estado ----------------------------------------------------

export const createCategory = async ({ code, name, description, parentId, icon: requestedIcon }) => {
  assertCodeFormat(code);
  const icon = resolveCategoryIcon({ requested: requestedIcon, parentId }) ?? null;
  const created = await withTransaction(async (transaction) => {
    if (parentId !== null) await assertParentAvailable(parentId, { transaction });
    await assertUniqueFields({ code, name, parentId }, { transaction });
    return categoryRepository.createCategory({ code, name, description, parentId, icon }, { transaction });
  });
  return toCategoryDto(await findCategoryOrFail(created.id));
};

/**
 * Edición. El nombre y la descripción se corrigen siempre. El código no cambia si la categoría ya
 * tiene productos, porque es el prefijo de sus códigos (LUBR-0001) y aparece en el historial.
 * Cambiar parentId mueve la categoría con todas sus subcategorías y productos (regla 1).
 */
export const updateCategory = async (id, changes) => {
  const category = await findCategoryOrFail(id);
  const update = {};

  if (changes.name !== undefined && changes.name !== category.name) update.name = changes.name;
  if (changes.description !== undefined && changes.description !== category.description) update.description = changes.description;

  if (changes.code !== undefined && changes.code !== category.code) {
    assertCodeFormat(changes.code);
    const totalProducts = Number(category.totalProducts ?? 0);
    if (totalProducts > 0) {
      const message = `No se puede cambiar el código de ${category.code}: es el prefijo de ${plural(totalProducts, 'producto', 'productos')} (${category.code}-0001…)`;
      throw new AppError('HAS_DEPENDENCIES', { message, details: [fieldIssue('code', message)] });
    }
    update.code = changes.code;
  }

  const parentId = changes.parentId === undefined ? category.parentId : changes.parentId;
  const moves = parentId !== category.parentId;
  if (moves) update.parentId = parentId;

  const icon = resolveCategoryIcon({ current: category.icon, requested: changes.icon, parentId });
  if (icon !== undefined) update.icon = icon;

  if (!Object.keys(update).length) return toCategoryDto(category);

  await withTransaction(async (transaction) => {
    if (moves) {
      await categoryRepository.lockTreeForMove({ transaction });
      if (parentId !== null) {
        await assertNoCycle(category, parentId, { transaction });
        await assertParentAvailable(parentId, { transaction });
      }
    }
    // El nombre se valida contra sus nuevas hermanas si cambia el nombre o el padre.
    const name = update.name ?? (moves ? category.name : undefined);
    await assertUniqueFields({ code: update.code, name, parentId }, { excludeId: category.id, transaction });
    await categoryRepository.updateCategory(category.id, update, { transaction });
  });

  return toCategoryDto(await findCategoryOrFail(category.id));
};

/**
 * Regla 3: no se desactiva una categoría con hijas activas ni con productos activos. Se cuenta con
 * la fila bloqueada FOR UPDATE: quien crea una hija la bloquea FOR SHARE, así que uno espera al otro.
 */
export const deactivateCategory = async (id) => {
  const category = await findCategoryOrFail(id);
  if (!category.isActive) return toCategoryDto(category);

  await withTransaction(async (transaction) => {
    await findCategoryOrFail(id, { transaction, lock: 'update' });
    const { activeChildren, activeProducts } = await categoryRepository.countActiveDependencies(id, { transaction });
    if (activeChildren > 0) {
      throw new AppError('HAS_DEPENDENCIES', {
        message: `No se puede desactivar ${category.code}: tiene ${plural(activeChildren, 'subcategoría activa', 'subcategorías activas')}. Desactívelas o muévalas primero.`,
        details: { categoryCode: category.code, activeChildren },
      });
    }
    if (activeProducts > 0) {
      throw new AppError('HAS_DEPENDENCIES', {
        message: `No se puede desactivar ${category.code}: tiene ${plural(activeProducts, 'producto activo', 'productos activos')}.`,
        details: { categoryCode: category.code, activeProducts },
      });
    }
    await categoryRepository.updateCategory(id, { isActive: false }, { transaction });
  });

  return toCategoryDto(await findCategoryOrFail(id));
};

/** Una subcategoría solo se reactiva si su categoría padre está activa. */
export const activateCategory = async (id) => {
  const category = await findCategoryOrFail(id);
  if (category.isActive) return toCategoryDto(category);
  if (category.parent && !category.parent.isActive) {
    throw new AppError('INACTIVE_RESOURCE', {
      message: `Active primero la categoría padre ${category.parent.code}`,
      details: { parentCode: category.parent.code },
    });
  }
  await categoryRepository.updateCategory(id, { isActive: true });
  return toCategoryDto(await findCategoryOrFail(id));
};

/**
 * Para el service de productos (HU-204): la categoría existe y está activa, y queda bloqueada FOR
 * SHARE hasta el fin de la transacción para que no se desactive mientras se registra el producto.
 */
export const assertCategoryAvailable = async (id, { transaction }) => {
  const category = await categoryRepository.findCategoryById(id, { transaction, lock: 'share' });
  if (!category) {
    const message = `La categoría ${id} no existe`;
    throw new AppError('VALIDATION_ERROR', { message, details: [fieldIssue('categoryId', message)] });
  }
  if (!category.isActive) {
    throw new AppError('INACTIVE_RESOURCE', {
      message: `La categoría ${category.code} está desactivada: no admite productos nuevos`,
      details: [fieldIssue('categoryId', `${category.code} está desactivada`)],
    });
  }
  return category;
};
