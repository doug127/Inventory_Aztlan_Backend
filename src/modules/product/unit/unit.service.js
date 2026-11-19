// Unidades con conversión (HU-202, business_rules.md §6.3).
//  1. Una unidad base tiene conversion_factor = 1 y base_unit_id = NULL.
//  2. Una unidad derivada indica a qué unidad base equivale (TAMB = 208 L). La base debe ser una
//     unidad base: no hay cadenas (TAMB → GAL → L), así toda conversión es un solo paso.
//  3. No se desactiva una unidad usada por productos activos (ni una base con derivadas activas).
// Consultar es para todos los roles; crear, editar y desactivar, para ADMIN o superior (lo exige la ruta).
import Decimal from 'decimal.js';
import { AppError } from '#src/shared/errors/AppError.js';
import { withTransaction } from '#src/shared/db/transaction.js';
import * as unitRepository from './unit.repository.js';
import { normalizeDecimal, toUnitDto } from './unit.dto.js';

export const UNIT_CODE_PATTERN = /^[A-Z]{1,10}$/;
// Las cantidades del inventario son NUMERIC(14,3): las conversiones se redondean a 3 decimales.
export const QUANTITY_DECIMALS = 3;

const fieldIssue = (path, message) => ({ location: 'body', path, message });
const validationError = (path, message) => new AppError('VALIDATION_ERROR', { message, details: [fieldIssue(path, message)] });

const findUnitOrFail = async (id, options) => {
  const unit = await unitRepository.findUnitById(id, options);
  if (!unit) throw new AppError('NOT_FOUND', { message: `Unidad ${id} no encontrada` });
  return unit;
};

const assertCodeFormat = (code) => {
  if (!UNIT_CODE_PATTERN.test(code)) {
    const message = 'El código debe tener de 1 a 10 letras de la A a la Z, sin números ni espacios (ej. L, KG, TAMB)';
    throw new AppError('INVALID_CODE_FORMAT', { message, details: [fieldIssue('code', message)] });
  }
};

const assertUniqueFields = async ({ code, name }, { excludeId } = {}) => {
  const taken = await unitRepository.findTakenFields({ code, name }, { excludeId });
  const details = [];
  if (taken.code) details.push(fieldIssue('code', `Ya existe una unidad con el código ${code}`));
  if (taken.name) details.push(fieldIssue('name', 'Ya existe una unidad con ese nombre'));
  if (details.length) throw new AppError('DUPLICATE_CODE', { message: details.map((d) => d.message).join('. '), details });
};

/** Regla 2: la unidad base existe, está activa, es base (no derivada) y no es la misma unidad. */
const resolveBaseUnit = async (baseUnitId, { selfId } = {}) => {
  if (selfId && baseUnitId === selfId) throw validationError('baseUnitId', 'Una unidad no puede ser su propia unidad base');
  const base = await unitRepository.findUnitById(baseUnitId);
  if (!base) throw validationError('baseUnitId', `La unidad base ${baseUnitId} no existe`);
  if (base.baseUnitId !== null) {
    throw validationError('baseUnitId', `${base.code} es una unidad derivada; elija una unidad base (ej. ${base.baseUnit?.code ?? 'L'})`);
  }
  if (!base.isActive) throw new AppError('INACTIVE_RESOURCE', { message: `La unidad base ${base.code} está desactivada` });
  return base;
};

/** Regla 1 y 2: una base lleva factor 1; una derivada, un factor > 0. */
const resolveFactor = (isBase, factor) => {
  if (isBase) {
    if (factor !== undefined && !new Decimal(factor).eq(1)) {
      throw validationError('conversionFactor', 'Una unidad base tiene factor 1: para otro factor, indique su unidad base');
    }
    return '1';
  }
  if (factor === undefined) throw validationError('conversionFactor', 'Indique a cuántas unidades base equivale (ej. 208 para TAMB)');
  if (new Decimal(factor).lte(0)) throw validationError('conversionFactor', 'El factor de conversión debe ser mayor que 0');
  return factor;
};

// --- Consultas ---------------------------------------------------------------

export const listUnits = async (query) => {
  const { page, limit, search, sort, order, isActive, kind, baseUnitId } = query;
  const { items, total } = await unitRepository.listUnits(query);
  return {
    items: items.map(toUnitDto),
    total,
    page,
    limit,
    search: search ?? null,
    filters: Object.fromEntries(Object.entries({ isActive, kind, baseUnitId }).filter(([, v]) => v !== undefined)),
    sort: { field: sort, order },
  };
};

export const getUnit = async (id) => toUnitDto(await findUnitOrFail(id));

// --- Alta, edición y estado ----------------------------------------------------

export const createUnit = async ({ code, name, baseUnitId, conversionFactor }) => {
  assertCodeFormat(code);
  const isBase = baseUnitId === null;
  if (!isBase) await resolveBaseUnit(baseUnitId);
  const factor = resolveFactor(isBase, conversionFactor);
  await assertUniqueFields({ code, name });

  const created = await unitRepository.createUnit({ code, name, baseUnitId, conversionFactor: factor });
  return toUnitDto(await findUnitOrFail(created.id));
};

/**
 * Edición. El nombre y el factor se pueden corregir siempre: las cantidades del inventario se
 * guardan en la unidad del producto, así que un factor nuevo solo afecta conversiones futuras.
 * No se cambia, en cambio, lo que alteraría la lectura de los datos ya registrados:
 *  - el código, si algún producto usa la unidad (aparece junto a cada cantidad);
 *  - la unidad base (o pasar de base a derivada), si algún producto la usa;
 *  - convertir en derivada una base que tiene derivadas (crearía una cadena de dos niveles).
 */
export const updateUnit = async (id, changes) => {
  const unit = await findUnitOrFail(id);
  const totalProducts = Number(unit.totalProducts ?? 0);
  const update = {};

  if (changes.name !== undefined && changes.name !== unit.name) update.name = changes.name;

  if (changes.code !== undefined && changes.code !== unit.code) {
    assertCodeFormat(changes.code);
    if (totalProducts > 0) {
      const message = `No se puede cambiar el código de ${unit.code}: la usan ${totalProducts} ${totalProducts === 1 ? 'producto' : 'productos'}`;
      throw new AppError('HAS_DEPENDENCIES', { message, details: [fieldIssue('code', message)] });
    }
    update.code = changes.code;
  }

  const nextBaseUnitId = changes.baseUnitId === undefined ? unit.baseUnitId : changes.baseUnitId;
  const baseChanges = nextBaseUnitId !== unit.baseUnitId;
  if (baseChanges) {
    if (totalProducts > 0) {
      const message = `No se puede cambiar la unidad base de ${unit.code}: la usan ${totalProducts} ${totalProducts === 1 ? 'producto' : 'productos'}`;
      throw new AppError('HAS_DEPENDENCIES', { message, details: [fieldIssue('baseUnitId', message)] });
    }
    if (nextBaseUnitId !== null && Number(unit.totalDerivedUnits ?? 0) > 0) {
      const message = `${unit.code} es la base de otras unidades: no puede convertirse en derivada`;
      throw new AppError('HAS_DEPENDENCIES', { message, details: [fieldIssue('baseUnitId', message)] });
    }
    if (nextBaseUnitId !== null) await resolveBaseUnit(nextBaseUnitId, { selfId: unit.id });
    update.baseUnitId = nextBaseUnitId;
  }

  const isBase = nextBaseUnitId === null;
  const requestedFactor = changes.conversionFactor ?? (baseChanges ? undefined : normalizeDecimal(unit.conversionFactor));
  const factor = resolveFactor(isBase, requestedFactor);
  if (!new Decimal(factor).eq(unit.conversionFactor)) update.conversionFactor = factor;

  if (!Object.keys(update).length) return toUnitDto(unit);

  await assertUniqueFields({ code: update.code, name: update.name }, { excludeId: unit.id });
  await unitRepository.updateUnit(unit.id, update);
  return toUnitDto(await findUnitOrFail(unit.id));
};

/**
 * Regla 3: no se desactiva una unidad usada por productos activos, ni una base con derivadas
 * activas (quedarían apuntando a una base inactiva). Se cuenta con la fila bloqueada.
 */
export const deactivateUnit = async (id) => {
  const unit = await findUnitOrFail(id);
  if (!unit.isActive) return toUnitDto(unit);

  await withTransaction(async (transaction) => {
    await findUnitOrFail(id, { transaction, lock: true });
    const { activeProducts, activeDerivedUnits } = await unitRepository.countUsage(id, { transaction });
    if (activeProducts > 0) {
      throw new AppError('HAS_DEPENDENCIES', {
        message: `No se puede desactivar ${unit.code}: la usan ${activeProducts} ${activeProducts === 1 ? 'producto activo' : 'productos activos'}`,
        details: { unitCode: unit.code, activeProducts },
      });
    }
    if (activeDerivedUnits > 0) {
      throw new AppError('HAS_DEPENDENCIES', {
        message: `No se puede desactivar ${unit.code}: es la base de ${activeDerivedUnits} ${
          activeDerivedUnits === 1 ? 'unidad activa' : 'unidades activas'
        }. Desactívelas primero.`,
        details: { unitCode: unit.code, activeDerivedUnits },
      });
    }
    await unitRepository.updateUnit(id, { isActive: false }, { transaction });
  });

  return toUnitDto(await findUnitOrFail(id));
};

/** Una derivada solo se reactiva si su unidad base está activa. */
export const activateUnit = async (id) => {
  const unit = await findUnitOrFail(id);
  if (unit.isActive) return toUnitDto(unit);
  if (unit.baseUnit && !unit.baseUnit.isActive) {
    throw new AppError('INACTIVE_RESOURCE', {
      message: `Active primero la unidad base ${unit.baseUnit.code}`,
      details: { baseUnitCode: unit.baseUnit.code },
    });
  }
  await unitRepository.updateUnit(id, { isActive: true });
  return toUnitDto(await findUnitOrFail(id));
};

// --- Conversión ----------------------------------------------------------------

/** Unidad base de la "familia" de una unidad (ella misma si es base). */
const familyOf = (unit) => unit.baseUnitId ?? unit.id;

/**
 * Convierte una cantidad entre dos unidades de la misma familia, con decimal.js:
 *   cantidad × factor(origen) ÷ factor(destino), redondeado a 3 decimales.
 * 2 TAMB → L = 2 × 208 ÷ 1 = 416. 500 ML → GAL = 500 × 0.001 ÷ 3.785411 = 0.132.
 * La usa el endpoint de conversión y la usará el registro de movimientos (Sprints 5 y 6).
 */
export const convertQuantity = (quantity, fromUnit, toUnit) => {
  if (familyOf(fromUnit) !== familyOf(toUnit)) {
    throw new AppError('VALIDATION_ERROR', {
      message: `No se puede convertir ${fromUnit.code} a ${toUnit.code}: miden magnitudes distintas`,
      details: [{ location: 'query', path: 'to', message: `${toUnit.code} no es de la misma familia que ${fromUnit.code}` }],
    });
  }
  const ratio = new Decimal(fromUnit.conversionFactor).div(toUnit.conversionFactor);
  const result = new Decimal(quantity).mul(ratio).toDecimalPlaces(QUANTITY_DECIMALS, Decimal.ROUND_HALF_UP);
  return { result: result.toFixed(QUANTITY_DECIMALS), ratio: ratio.toDecimalPlaces(10).toString() };
};

export const convert = async ({ from, to, quantity }) => {
  const [fromUnit, toUnit] = await Promise.all([unitRepository.findUnitByCode(from), unitRepository.findUnitByCode(to)]);
  if (!fromUnit) throw new AppError('NOT_FOUND', { message: `La unidad ${from} no existe` });
  if (!toUnit) throw new AppError('NOT_FOUND', { message: `La unidad ${to} no existe` });
  const { result, ratio } = convertQuantity(quantity, fromUnit, toUnit);
  return {
    from: { code: fromUnit.code, quantity: normalizeDecimal(quantity) },
    to: { code: toUnit.code, quantity: result },
    ratio,
    text: `${normalizeDecimal(quantity)} ${fromUnit.code} = ${normalizeDecimal(result)} ${toUnit.code}`,
  };
};

/**
 * Para el service de productos (HU-204): la unidad existe y está activa, y queda bloqueada FOR
 * SHARE hasta el fin de la transacción para que no se desactive mientras se registra el producto.
 */
export const assertUnitAvailable = async (id, { transaction }) => {
  const unit = await unitRepository.findUnitById(id, { transaction, lock: 'share' });
  if (!unit) {
    const message = `La unidad ${id} no existe`;
    throw new AppError('VALIDATION_ERROR', { message, details: [{ location: 'body', path: 'unitId', message }] });
  }
  if (!unit.isActive) {
    throw new AppError('INACTIVE_RESOURCE', {
      message: `La unidad ${unit.code} está desactivada: no puede asignarse a productos`,
      details: [{ location: 'body', path: 'unitId', message: `${unit.code} está desactivada` }],
    });
  }
  return unit;
};
