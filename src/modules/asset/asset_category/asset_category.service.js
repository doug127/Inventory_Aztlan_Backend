// Categorías de activos en árbol (HU-301, business_rules.md §6.2 y §6.6, naming_conventions.md §7.1).
//  1. Sin ciclos: el nuevo padre no puede ser la categoría ni una de sus descendientes (CTE
//     recursivo). Los cambios de padre se serializan con un candado.
//  2. El nombre es único dentro del mismo padre; el código (LINEA_AMARILLA) es único en el catálogo.
//  3. No se desactiva una categoría con hijas activas o con activos activos.
//  4. Un activo solo va en una categoría hoja, y una categoría con activos no admite subcategorías
//     (CATEGORY_HAS_ASSETS). Los triggers de la migración 20261118000001 respaldan esta regla.
// Solo las raíces llevan icono; las subcategorías muestran el de su raíz.
// Consultar es para todos los roles; crear, editar, mover y desactivar, para ADMIN o superior (lo exige la ruta).
import { AppError } from '#src/shared/errors/AppError.js';
import { withTransaction } from '#src/shared/db/transaction.js';
import { buildCategoryTree, resolveCategoryIcon } from '#src/shared/utils/categoryTree.js';
import * as categoryRepository from './asset_category.repository.js';
import { toAssetCategoryDetailDto, toAssetCategoryDto, toAssetCategoryTreeDto, toAssetCountDto } from './asset_category.dto.js';

export const ASSET_CATEGORY_CODE_PATTERN = /^[A-Z][A-Z0-9_]{1,19}$/;

const fieldIssue = (path, message) => ({ location: 'body', path, message });
const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

const findCategoryOrFail = async (id, options) => {
  const category = await categoryRepository.findCategoryById(id, options);
  if (!category) throw new AppError('NOT_FOUND', { message: `Categoría de activos ${id} no encontrada` });
  return category;
};

const assertCodeFormat = (code) => {
  if (!ASSET_CATEGORY_CODE_PATTERN.test(code)) {
    const message = 'El código va en mayúsculas, empieza con una letra y usa letras, números o guion bajo (ej. LINEA_AMARILLA, LOTE_3)';
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
 * El padre existe, está activo y no tiene activos (regla 4). Se bloquea FOR UPDATE: quien registra
 * un activo bloquea su categoría FOR SHARE, así que una hija y un activo nunca llegan a la vez.
 */
const assertParentAvailable = async (parentId, { transaction }) => {
  const parent = await categoryRepository.findCategoryById(parentId, { transaction, lock: 'update' });
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
  const { totalAssets } = await categoryRepository.countDependencies(parentId, { transaction });
  if (totalAssets > 0) {
    const message = `${parent.code} tiene ${plural(totalAssets, 'activo', 'activos')}: no admite subcategorías. Mueva sus activos a otra categoría primero.`;
    throw new AppError('CATEGORY_HAS_ASSETS', { message, details: [fieldIssue('parentId', message)] });
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
  const { page, limit, search, sort, order, isActive, parentId, root, leaf } = query;
  const { items, total } = await categoryRepository.listCategories(query);
  return {
    items: items.map(toAssetCategoryDto),
    total,
    page,
    limit,
    search: search ?? null,
    filters: Object.fromEntries(Object.entries({ isActive, parentId, root, leaf }).filter(([, v]) => v !== undefined)),
    sort: { field: sort, order },
  };
};

/** Árbol completo: raíces ordenadas por nombre, cada nodo con sus hijas y los activos de su rama. */
export const getCategoryTree = async ({ isActive } = {}) =>
  toAssetCategoryTreeDto(buildCategoryTree(await categoryRepository.findAllCategories(), { isActive, countOf: (row) => row.totalAssets }));

/** Ficha: la categoría, su ruta desde la raíz y sus hijas directas. */
export const getCategory = async (id) => {
  const category = await findCategoryOrFail(id);
  const [path, children] = await Promise.all([categoryRepository.findAncestors(id), categoryRepository.findChildren(id)]);
  return toAssetCategoryDetailDto(category, { path, children });
};

/**
 * Cuántos activos hay en una categoría contando todas sus subcategorías (HU-303), con el desglose
 * por subcategoría directa. Sin categoría, el resumen de la finca por raíz. Se identifica por id
 * (la UI) o por código (el asistente, count_assets con asset_category_code).
 */
export const countAssets = async ({ categoryId, code } = {}) => {
  let category = null;
  if (categoryId !== undefined) category = await findCategoryOrFail(categoryId);
  else if (code !== undefined) {
    category = await categoryRepository.findCategoryByCode(code);
    if (!category) throw new AppError('NOT_FOUND', { message: `No existe la categoría de activos ${code}` });
  }

  const [groups, path] = await Promise.all([
    categoryRepository.findChildCategories(category?.id ?? null),
    category ? categoryRepository.findAncestors(category.id) : [],
  ]);
  const ids = [...(category ? [category.id] : []), ...groups.map((g) => g.id)];
  const counts = new Map((await categoryRepository.countAssetsInSubtrees(ids)).map((row) => [row.categoryId, row]));
  return toAssetCountDto({ category, path, groups, counts });
};

/**
 * Ids de la categoría y todas sus subcategorías: para contar activos por rama (HU-303) y para los
 * reportes de consumo por categoría (HU-501: LINEA_AMARILLA suma retroexcavadoras y cargadores).
 */
export const getSubtreeIds = async (id, { transaction } = {}) => {
  const ids = await categoryRepository.findSubtreeIds(id, { transaction });
  if (!ids.length) throw new AppError('NOT_FOUND', { message: `Categoría de activos ${id} no encontrada` });
  return ids;
};

// --- Alta, edición y estado ----------------------------------------------------

export const createCategory = async ({ code, name, parentId, icon: requestedIcon }) => {
  assertCodeFormat(code);
  const icon = resolveCategoryIcon({ requested: requestedIcon, parentId }) ?? null;
  const created = await withTransaction(async (transaction) => {
    if (parentId !== null) await assertParentAvailable(parentId, { transaction });
    await assertUniqueFields({ code, name, parentId }, { transaction });
    return categoryRepository.createCategory({ code, name, parentId, icon }, { transaction });
  });
  return toAssetCategoryDto(await findCategoryOrFail(created.id));
};

/**
 * Edición. El código y el nombre se corrigen siempre: los activos y el historial se enlazan por id.
 * Cambiar parentId mueve la categoría con todas sus subcategorías y activos (reglas 1 y 4). Al
 * quedar dentro de otra pierde su icono; al volverse raíz puede recibir uno.
 */
export const updateCategory = async (id, changes) => {
  const category = await findCategoryOrFail(id);
  const update = {};

  if (changes.name !== undefined && changes.name !== category.name) update.name = changes.name;
  if (changes.code !== undefined && changes.code !== category.code) {
    assertCodeFormat(changes.code);
    update.code = changes.code;
  }

  const parentId = changes.parentId === undefined ? category.parentId : changes.parentId;
  const moves = parentId !== category.parentId;
  if (moves) update.parentId = parentId;

  const icon = resolveCategoryIcon({ current: category.icon, requested: changes.icon, parentId });
  if (icon !== undefined) update.icon = icon;

  if (!Object.keys(update).length) return toAssetCategoryDto(category);

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

  return toAssetCategoryDto(await findCategoryOrFail(category.id));
};

/**
 * Regla 3: no se desactiva una categoría con hijas activas ni con activos activos. Se cuenta con la
 * fila bloqueada FOR UPDATE, así una hija o un activo nuevo esperan a que termine.
 */
export const deactivateCategory = async (id) => {
  const category = await findCategoryOrFail(id);
  if (!category.isActive) return toAssetCategoryDto(category);

  await withTransaction(async (transaction) => {
    await findCategoryOrFail(id, { transaction, lock: 'update' });
    const { activeChildren, activeAssets } = await categoryRepository.countDependencies(id, { transaction });
    if (activeChildren > 0) {
      throw new AppError('HAS_DEPENDENCIES', {
        message: `No se puede desactivar ${category.code}: tiene ${plural(activeChildren, 'subcategoría activa', 'subcategorías activas')}. Desactívelas o muévalas primero.`,
        details: { categoryCode: category.code, activeChildren },
      });
    }
    if (activeAssets > 0) {
      throw new AppError('HAS_DEPENDENCIES', {
        message: `No se puede desactivar ${category.code}: tiene ${plural(activeAssets, 'activo activo', 'activos activos')}.`,
        details: { categoryCode: category.code, activeAssets },
      });
    }
    await categoryRepository.updateCategory(id, { isActive: false }, { transaction });
  });

  return toAssetCategoryDto(await findCategoryOrFail(id));
};

/** Una subcategoría solo se reactiva si su categoría padre está activa. */
export const activateCategory = async (id) => {
  const category = await findCategoryOrFail(id);
  if (category.isActive) return toAssetCategoryDto(category);
  if (category.parent && !category.parent.isActive) {
    throw new AppError('INACTIVE_RESOURCE', {
      message: `Active primero la categoría padre ${category.parent.code}`,
      details: { parentCode: category.parent.code },
    });
  }
  await categoryRepository.updateCategory(id, { isActive: true });
  return toAssetCategoryDto(await findCategoryOrFail(id));
};

/**
 * Para el service de activos (HU-302): la categoría existe, está activa y es hoja (regla 4). Queda
 * bloqueada FOR SHARE hasta el fin de la transacción: nadie puede desactivarla ni colgarle una
 * subcategoría mientras se registra el activo.
 */
export const assertLeafCategoryAvailable = async (id, { transaction }) => {
  const category = await categoryRepository.findCategoryById(id, { transaction, lock: 'share' });
  if (!category) {
    const message = `La categoría de activos ${id} no existe`;
    throw new AppError('VALIDATION_ERROR', { message, details: [fieldIssue('categoryId', message)] });
  }
  if (!category.isActive) {
    throw new AppError('INACTIVE_RESOURCE', {
      message: `La categoría ${category.code} está desactivada: no admite activos nuevos`,
      details: [fieldIssue('categoryId', `${category.code} está desactivada`)],
    });
  }
  const { totalChildren } = await categoryRepository.countDependencies(id, { transaction });
  if (totalChildren > 0) {
    const message = `${category.code} tiene subcategorías: el activo va en la más específica (ej. TRACTOR, no VEHICULOS)`;
    throw new AppError('CATEGORY_NOT_LEAF', { message, details: [fieldIssue('categoryId', message)] });
  }
  return category;
};
