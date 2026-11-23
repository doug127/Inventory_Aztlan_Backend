// Activos (HU-302, business_rules.md §6.5, naming_conventions.md §7.2).
//  1. Solo requieren código, nombre y categoría hoja activa (assertLeafCategoryAvailable, que la
//     bloquea FOR SHARE: nadie le cuelga una subcategoría mientras tanto).
//  2. El nombre es único dentro de su categoría; el código (T-01, TB-100, PE-TAL) en toda la finca.
//  3. Un activo inactivo no recibe movimientos nuevos (assertAssetAvailable, para HU-401).
//  4. No se desactiva con préstamos pendientes de devolución.
// Si no se indica el código, se asigna el siguiente correlativo del prefijo de la categoría
// (TRACTOR usa T: T-02 es el último → T-03), con un candado por prefijo.
// Consultar es para todos los roles; crear, editar y desactivar, para ADMIN o superior (lo exige la ruta).
import { AppError } from '#src/shared/errors/AppError.js';
import { withTransaction } from '#src/shared/db/transaction.js';
import { assertLeafCategoryAvailable, getSubtreeIds } from './asset_category/asset_category.service.js';
import * as assetRepository from './asset.repository.js';
import Decimal from 'decimal.js';
import { ASSET_LINE_KINDS } from '#src/shared/constants/movements.js';
import { toAssetConsumptionDto, toAssetDto, toAssetGroupDto, toAssetHistoryLineDto } from './asset.dto.js';

export const ASSET_CODE_PATTERN = /^[A-Z]{1,4}-[A-Z0-9]{1,5}$/;
const MAX_IDENTIFIER_DIGITS = 5;

const fieldIssue = (path, message) => ({ location: 'body', path, message });

const findAssetOrFail = async (id, options) => {
  const asset = await assetRepository.findAssetById(id, options);
  if (!asset) throw new AppError('NOT_FOUND', { message: `Activo ${id} no encontrado` });
  return asset;
};

const assertCodeFormat = (code) => {
  if (!ASSET_CODE_PATTERN.test(code)) {
    const message = 'El código es PREFIJO-IDENTIFICADOR: 1 a 4 letras, guion y 1 a 5 letras o números (ej. T-01, TB-100, PE-TAL)';
    throw new AppError('INVALID_CODE_FORMAT', { message, details: [fieldIssue('code', message)] });
  }
};

/** Regla 2. Se verifica antes para responder por campo; los UNIQUE de la BD cubren las carreras. */
const assertUniqueFields = async ({ code, name, categoryId }, { excludeId, transaction } = {}) => {
  const taken = await assetRepository.findTakenFields({ code, name, categoryId }, { excludeId, transaction });
  const details = [];
  if (taken.code) details.push(fieldIssue('code', `Ya existe un activo con el código ${code}`));
  if (taken.name) details.push(fieldIssue('name', 'Ya existe un activo con ese nombre en la categoría'));
  if (details.length) throw new AppError('DUPLICATE_CODE', { message: details.map((d) => d.message).join('. '), details });
};

/**
 * Siguiente código del prefijo que usa la categoría: el mayor identificador numérico en toda la
 * finca + 1, con el mismo ancho (T-02 → T-03, TB-200 → TB-201). null si la categoría aún no tiene
 * activos o si sus identificadores no son números (PE-TAL): ahí el código se escribe a mano.
 */
const suggestCode = async (categoryId, { transaction } = {}) => {
  const prefix = await assetRepository.findCategoryPrefix(categoryId, { transaction });
  if (!prefix) return { prefix: null, code: null };
  const { last, width } = await assetRepository.findLastNumber(prefix, { transaction });
  if (last === null) return { prefix, code: null };
  const identifier = String(last + 1).padStart(width, '0');
  return { prefix, code: identifier.length > MAX_IDENTIFIER_DIGITS ? null : `${prefix}-${identifier}` };
};

// --- Consultas ---------------------------------------------------------------

/** Lista paginada. categoryId incluye sus subcategorías (VEHICULOS trae tractores, camiones…). */
export const listAssets = async (query) => {
  const { page, limit, search, sort, order, isActive, categoryId } = query;
  const categoryIds = categoryId ? await getSubtreeIds(categoryId) : undefined;
  const { items, total } = await assetRepository.listAssets({ ...query, categoryIds });
  return {
    items: items.map(toAssetDto),
    total,
    page,
    limit,
    search: search ?? null,
    filters: Object.fromEntries(Object.entries({ isActive, categoryId }).filter(([, v]) => v !== undefined)),
    sort: { field: sort, order },
  };
};

/**
 * Activos agrupados por categoría hoja, para las ramas con muchos activos (CAMPO con 20 lotes de
 * 40 tablones): primero los lotes con su cantidad y su rango de códigos, y al abrir uno se listan
 * sus tablones con listAssets({ categoryId: lote }). Mismos filtros que listAssets.
 */
export const listAssetGroups = async (query) => {
  const { page, limit, search, isActive, categoryId } = query;
  const categoryIds = categoryId ? await getSubtreeIds(categoryId) : undefined;
  const { items, total } = await assetRepository.listAssetGroups({ ...query, categoryIds });
  return {
    items: items.map(toAssetGroupDto),
    total,
    page,
    limit,
    search: search ?? null,
    filters: Object.fromEntries(Object.entries({ isActive, categoryId }).filter(([, v]) => v !== undefined)),
    sort: { field: 'categoryPath', order: 'asc' },
  };
};

// --- Ficha del activo (HU-304) -----------------------------------------------------

const QUANTITY_DECIMALS = 3; // NUMERIC(14,3)

/**
 * Consumo del activo en el período, por producto: consumido (OUT CONSUMO), corregido (IN OTRO con
 * referencia REV-) y neto = consumido − corregido (business_rules.md §5). Ordenado por consumo neto,
 * de mayor a menor. Incluye los préstamos pendientes (no dependen del período) y la actividad total.
 * Un activo inactivo también tiene ficha: su historial se conserva (§6.5 regla 3).
 */
export const getAssetConsumption = async (id, { from, to } = {}) => {
  const asset = await findAssetOrFail(id);
  const [rows, pendingLoans, activity] = await Promise.all([
    assetRepository.findAssetConsumption(id, { from, to }),
    assetRepository.findPendingLoans(id),
    assetRepository.findAssetActivity(id),
  ]);
  const consumption = rows
    .map((row) => ({ ...row, net: new Decimal(row.consumed).minus(row.corrected) }))
    .sort((a, b) => b.net.comparedTo(a.net) || a.code.localeCompare(b.code))
    .map((row) => ({
      ...row,
      consumed: new Decimal(row.consumed).toFixed(QUANTITY_DECIMALS),
      corrected: new Decimal(row.corrected).toFixed(QUANTITY_DECIMALS),
      net: row.net.toFixed(QUANTITY_DECIMALS),
    }));
  return toAssetConsumptionDto({ asset, period: { from, to }, activity, consumption, pendingLoans });
};

/** Cuánto suma cada línea al consumo neto: + en CONSUMO, − en CORRECCION, 0 en el resto. */
const consumptionEffectOf = ({ kind, quantity }) => {
  const q = new Decimal(quantity);
  if (kind === ASSET_LINE_KINDS.CONSUMO) return q.toFixed(QUANTITY_DECIMALS);
  if (kind === ASSET_LINE_KINDS.CORRECCION) return q.negated().toFixed(QUANTITY_DECIMALS);
  return new Decimal(0).toFixed(QUANTITY_DECIMALS);
};

/** Historial de movimientos del activo (todas sus líneas), del más reciente al más antiguo. */
export const listAssetHistory = async (id, query) => {
  await findAssetOrFail(id);
  const { page, limit, from, to, productId, kind } = query;
  const { items, total } = await assetRepository.listAssetHistory(id, { page, limit, from, to, productId, kinds: kind });
  return {
    items: items.map((line) => toAssetHistoryLineDto({ ...line, consumptionEffect: consumptionEffectOf(line) })),
    total,
    page,
    limit,
    search: null,
    filters: Object.fromEntries(Object.entries({ from, to, productId, kind }).filter(([, v]) => v !== undefined)),
    sort: { field: 'movementDate', order: 'desc' },
  };
};

export const getAsset = async (id) => toAssetDto(await findAssetOrFail(id));

/** Código sugerido para un activo nuevo de la categoría hoja (el formulario lo muestra en vivo). */
export const getNextCode = async ({ categoryId }) =>
  withTransaction(async (transaction) => {
    const category = await assertLeafCategoryAvailable(categoryId, { transaction });
    return { categoryId: category.id, categoryCode: category.code, ...(await suggestCode(category.id, { transaction })) };
  });

// --- Alta, edición y estado ----------------------------------------------------

export const createAsset = async ({ code, name, categoryId }) => {
  if (code) assertCodeFormat(code);
  const created = await withTransaction(async (transaction) => {
    const category = await assertLeafCategoryAvailable(categoryId, { transaction });
    let finalCode = code;
    if (!finalCode) {
      const prefix = await assetRepository.findCategoryPrefix(category.id, { transaction });
      if (prefix) await assetRepository.lockCodeSequence(prefix, { transaction });
      finalCode = (await suggestCode(category.id, { transaction })).code;
      if (!finalCode) {
        const message = prefix
          ? `Indique el código: los activos de ${category.code} no usan un correlativo numérico (ej. ${prefix}-TAL)`
          : `Indique el código: ${category.code} aún no tiene activos, así que no hay un prefijo que continuar (ej. T-01)`;
        throw new AppError('VALIDATION_ERROR', { message, details: [fieldIssue('code', message)] });
      }
    }
    await assertUniqueFields({ code: finalCode, name, categoryId: category.id }, { transaction });
    return assetRepository.createAsset({ code: finalCode, name, assetCategoryId: category.id }, { transaction });
  });
  return toAssetDto(await findAssetOrFail(created.id));
};

/**
 * Edición. El nombre se corrige siempre y la categoría puede cambiar a otra hoja activa (una
 * reclasificación: los reportes por categoría muestran la actual). El código no cambia si el
 * activo ya tiene movimientos, porque aparece en las órdenes impresas y en el historial.
 */
export const updateAsset = async (id, changes) => {
  const asset = await findAssetOrFail(id);
  const update = {};

  if (changes.name !== undefined && changes.name !== asset.name) update.name = changes.name;
  const codeChanges = changes.code !== undefined && changes.code !== asset.code;
  const categoryChanges = changes.categoryId !== undefined && changes.categoryId !== asset.assetCategoryId;
  if (codeChanges) assertCodeFormat(changes.code);

  if (!codeChanges && !categoryChanges && !Object.keys(update).length) return toAssetDto(asset);

  await withTransaction(async (transaction) => {
    await findAssetOrFail(id, { transaction, lock: 'update' });
    if (codeChanges) {
      if (await assetRepository.hasMovements(id, { transaction })) {
        const message = `No se puede cambiar el código de ${asset.code}: ya aparece en movimientos registrados`;
        throw new AppError('HAS_DEPENDENCIES', { message, details: [fieldIssue('code', message)] });
      }
      update.code = changes.code;
    }
    if (categoryChanges) {
      await assertLeafCategoryAvailable(changes.categoryId, { transaction });
      update.assetCategoryId = changes.categoryId;
    }
    // El nombre se valida contra la categoría final si cambia el nombre o la categoría.
    const categoryId = update.assetCategoryId ?? asset.assetCategoryId;
    const name = update.name ?? (categoryChanges ? asset.name : undefined);
    await assertUniqueFields({ code: update.code, name, categoryId }, { excludeId: asset.id, transaction });
    await assetRepository.updateAsset(asset.id, update, { transaction });
  });

  return toAssetDto(await findAssetOrFail(asset.id));
};

/**
 * Regla 4: no se desactiva con préstamos pendientes. Se calculan con el activo bloqueado FOR
 * UPDATE: un préstamo nuevo lo bloquea FOR SHARE (assertAssetAvailable), así que uno espera al otro.
 */
export const deactivateAsset = async (id) => {
  const asset = await findAssetOrFail(id);
  if (!asset.isActive) return toAssetDto(asset);

  await withTransaction(async (transaction) => {
    await findAssetOrFail(id, { transaction, lock: 'update' });
    const loans = await assetRepository.findPendingLoans(id, { transaction });
    if (loans.length) {
      const list = loans.map((l) => `${l.code} (${Number(l.pending)} ${l.unitCode})`).join(', ');
      throw new AppError('HAS_DEPENDENCIES', {
        message: `No se puede desactivar ${asset.code}: tiene préstamos pendientes de devolución: ${list}. Registre la devolución primero.`,
        details: { assetCode: asset.code, pendingLoans: loans },
      });
    }
    await assetRepository.updateAsset(id, { isActive: false }, { transaction });
  });

  return toAssetDto(await findAssetOrFail(id));
};

/** Solo se reactiva si su categoría está activa. */
export const activateAsset = async (id) => {
  const asset = await findAssetOrFail(id);
  if (asset.isActive) return toAssetDto(asset);
  if (!asset.category.isActive) {
    throw new AppError('INACTIVE_RESOURCE', {
      message: `Active primero la categoría ${asset.category.code}`,
      details: { categoryCode: asset.category.code },
    });
  }
  await assetRepository.updateAsset(id, { isActive: true });
  return toAssetDto(await findAssetOrFail(id));
};

/**
 * Para el service de movimientos (HU-401, HU-405): el activo existe y está activo (regla 3), y
 * queda bloqueado FOR SHARE para que no se desactive mientras se registra el movimiento.
 */
export const assertAssetAvailable = async (id, { transaction }) => {
  const asset = await assetRepository.findAssetById(id, { transaction, lock: 'share' });
  if (!asset) throw new AppError('NOT_FOUND', { message: `El activo ${id} no existe` });
  if (!asset.isActive) {
    throw new AppError('INACTIVE_RESOURCE', {
      message: `El activo ${asset.code} está desactivado: no admite movimientos nuevos`,
      details: { assetCode: asset.code },
    });
  }
  return asset;
};
