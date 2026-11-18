// Almacenes (HU-201, business_rules.md §6.1).
//  1. El código es único, de 4 caracteres A-Z/0-9 (naming_conventions.md §4).
//  2. Solo se desactiva si su stock total es 0 en todos los productos.
//  3. Un almacén inactivo no puede ser origen ni destino de movimientos nuevos
//     (assertWarehouseAvailable, para el service de movimientos).
// Consultar es para todos los roles; crear, editar y desactivar, para ADMIN o superior (lo exige la ruta).
import { AppError } from '#src/shared/errors/AppError.js';
import { withTransaction } from '#src/shared/db/transaction.js';
import * as warehouseRepository from './warehouse.repository.js';
import { toWarehouseDto } from './warehouse.dto.js';

export const WAREHOUSE_CODE_PATTERN = /^[A-Z0-9]{4}$/;

const fieldIssue = (path, message) => ({ location: 'body', path, message });

const findWarehouseOrFail = async (id, options) => {
  const warehouse = await warehouseRepository.findWarehouseById(id, options);
  if (!warehouse) throw new AppError('NOT_FOUND', { message: `Almacén ${id} no encontrado` });
  return warehouse;
};

const assertCodeFormat = (code) => {
  if (!WAREHOUSE_CODE_PATTERN.test(code)) {
    const message = 'El código debe tener exactamente 4 caracteres: letras de la A a la Z o números (ej. COMB)';
    throw new AppError('INVALID_CODE_FORMAT', { message, details: [fieldIssue('code', message)] });
  }
};

/** Código y nombre únicos. Se verifica antes para responder por campo; el UNIQUE cubre las carreras. */
const assertUniqueFields = async ({ code, name }, { excludeId } = {}) => {
  const taken = await warehouseRepository.findTakenFields({ code, name }, { excludeId });
  const details = [];
  if (taken.code) details.push(fieldIssue('code', `Ya existe un almacén con el código ${code}`));
  if (taken.name) details.push(fieldIssue('name', 'Ya existe un almacén con ese nombre'));
  if (details.length) throw new AppError('DUPLICATE_CODE', { message: details.map((d) => d.message).join('. '), details });
};

// --- Consultas ---------------------------------------------------------------

export const listWarehouses = async (query) => {
  const { page, limit, search, isActive, sort, order } = query;
  const { items, total } = await warehouseRepository.listWarehouses(query);
  return {
    items: items.map(toWarehouseDto),
    total,
    page,
    limit,
    search: search ?? null,
    filters: isActive === undefined ? {} : { isActive },
    sort: { field: sort, order },
  };
};

export const getWarehouse = async (id) => toWarehouseDto(await findWarehouseOrFail(id));

// --- Alta, edición y estado ----------------------------------------------------

export const createWarehouse = async ({ code, name }) => {
  assertCodeFormat(code);
  await assertUniqueFields({ code, name });
  const created = await warehouseRepository.createWarehouse({ code, name });
  return toWarehouseDto(await findWarehouseOrFail(created.id));
};

/**
 * Edición de código y nombre. El código no se cambia si el almacén ya tiene movimientos: aparece
 * en las órdenes impresas y en el historial, y cambiarlo rompería esa trazabilidad. El nombre
 * sí se puede corregir siempre.
 */
export const updateWarehouse = async (id, changes) => {
  const warehouse = await findWarehouseOrFail(id);

  const update = {};
  if (changes.code !== undefined && changes.code !== warehouse.code) {
    assertCodeFormat(changes.code);
    if (await warehouseRepository.hasMovements(warehouse.id)) {
      const message = `No se puede cambiar el código de ${warehouse.code}: el almacén ya tiene movimientos registrados`;
      throw new AppError('HAS_DEPENDENCIES', { message, details: [fieldIssue('code', message)] });
    }
    update.code = changes.code;
  }
  if (changes.name !== undefined && changes.name !== warehouse.name) update.name = changes.name;
  if (!Object.keys(update).length) return toWarehouseDto(warehouse);

  await assertUniqueFields({ code: update.code, name: update.name }, { excludeId: warehouse.id });
  await warehouseRepository.updateWarehouse(warehouse.id, update);
  return toWarehouseDto(await findWarehouseOrFail(warehouse.id));
};

/**
 * Regla 2: solo se desactiva con stock 0 en todos los productos. La fila del almacén se bloquea
 * (FOR UPDATE) antes de contar: un movimiento que esté registrando sobre este almacén lo tiene
 * bloqueado FOR SHARE (assertWarehouseAvailable), así que uno espera al otro.
 * Desactivar un almacén ya inactivo no hace nada.
 */
export const deactivateWarehouse = async (id) => {
  const warehouse = await findWarehouseOrFail(id);
  if (!warehouse.isActive) return toWarehouseDto(warehouse);

  await withTransaction(async (transaction) => {
    await findWarehouseOrFail(id, { transaction, lock: 'update' });
    const productsWithStock = await warehouseRepository.countProductsWithStock(id, { transaction });
    if (productsWithStock > 0) {
      throw new AppError('HAS_STOCK', {
        message: `No se puede desactivar ${warehouse.code}: tiene existencias de ${productsWithStock} ${
          productsWithStock === 1 ? 'producto' : 'productos'
        }. Trasládelas o ajústelas a 0 primero.`,
        details: { warehouseCode: warehouse.code, productsWithStock },
      });
    }
    await warehouseRepository.updateWarehouse(id, { isActive: false }, { transaction });
  });

  return toWarehouseDto(await findWarehouseOrFail(id));
};

export const activateWarehouse = async (id) => {
  const warehouse = await findWarehouseOrFail(id);
  if (warehouse.isActive) return toWarehouseDto(warehouse);
  await warehouseRepository.updateWarehouse(id, { isActive: true });
  return toWarehouseDto(await findWarehouseOrFail(id));
};

// --- Para el service de movimientos (Sprints 5 y 6) ----------------------------

/**
 * Regla 3: verifica, dentro de la transacción del movimiento, que el almacén exista y esté activo,
 * y lo bloquea FOR SHARE para que no se desactive hasta que el movimiento termine.
 * `role` aparece en el mensaje: 'origen' o 'destino'.
 */
export const assertWarehouseAvailable = async (id, { transaction, role = 'origen' } = {}) => {
  const warehouse = await warehouseRepository.findWarehouseById(id, { transaction, lock: 'share' });
  if (!warehouse) throw new AppError('NOT_FOUND', { message: `El almacén de ${role} (${id}) no existe` });
  if (!warehouse.isActive) {
    throw new AppError('INACTIVE_RESOURCE', {
      message: `El almacén ${warehouse.code} está desactivado: no puede ser ${role} de movimientos nuevos`,
      details: { warehouseCode: warehouse.code },
    });
  }
  return warehouse;
};
