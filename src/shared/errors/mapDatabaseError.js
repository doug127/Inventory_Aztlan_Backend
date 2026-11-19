// Único lugar donde los errores de PostgreSQL / Sequelize se traducen al catálogo.
//
// Se decide por el código SQLSTATE y por el NOMBRE de la constraint (definido en las migraciones),
// nunca por el texto del mensaje: el servidor está configurado en español y los mensajes de pg
// llegan traducidos ("llave duplicada viola restricción de unicidad...").
//
// Un CHECK o FK que salta casi siempre indica una validación que le faltó al service: el mapeo da
// una respuesta razonable al cliente y el log (WARN con constraint=) avisa que hay que reforzarlo.
import { ConnectionError, TimeoutError, ValidationError } from 'sequelize';
import { AppError } from './AppError.js';
import { ERROR_CATALOG } from './errorCatalog.js';

export const PG_CODES = Object.freeze({
  UNIQUE: '23505',
  FOREIGN_KEY: '23503',
  RESTRICT: '23001', // ON DELETE RESTRICT: borrar un registro que otros aún referencian
  CHECK: '23514',
  NOT_NULL: '23502',
  RAISE: 'P0001',
  INVALID_TEXT: '22P02', // valor de ENUM, UUID o número mal formado
  OUT_OF_RANGE: '22003',
  STRING_TOO_LONG: '22001',
});

const CODE_FORMAT_CONSTRAINTS = [
  'chk_roles_code',
  'chk_users_username',
  'chk_warehouses_code',
  'chk_product_categories_code',
  'chk_units_code',
  'chk_products_code',
  'chk_asset_categories_code',
  'chk_assets_code',
  'chk_movement_headers_document_number',
];

// Nombre de constraint → código del catálogo y, si conviene, un mensaje más concreto.
export const CONSTRAINT_MAP = Object.freeze({
  ...Object.fromEntries(CODE_FORMAT_CONSTRAINTS.map((name) => [name, { code: 'INVALID_CODE_FORMAT' }])),

  // Inventario y movimientos
  chk_stock_quantity: { code: 'INSUFFICIENT_STOCK' },
  chk_movement_warehouses: { code: 'INVALID_MOVEMENT_WAREHOUSES' },
  chk_movement_reason: { code: 'INVALID_MOVEMENT_REASON' },
  chk_movement_document_prefix: { code: 'INVALID_CODE_FORMAT', message: 'El número de documento no corresponde al tipo de movimiento' },
  chk_movement_received_by: { code: 'VALIDATION_ERROR', message: 'Los préstamos requieren indicar quién recibe' },
  chk_movement_lines_quantity: { code: 'VALIDATION_ERROR', message: 'La cantidad de cada línea debe ser mayor que 0' },
  uq_movement_headers_idempotency_key: { code: 'DUPLICATE_REQUEST' },
  uq_movement_lines_header_product_asset: { code: 'VALIDATION_ERROR', message: 'Hay líneas repetidas con el mismo producto y activo' },

  // Autenticación y usuarios
  uq_reset_token_active: { code: 'AUTH_RATE_LIMITED' },
  uq_users_username: { code: 'DUPLICATE_CODE', message: 'El nombre de usuario ya existe' },
  uq_users_email: { code: 'DUPLICATE_CODE', message: 'El correo ya está registrado' },

  // Catálogos
  uq_warehouses_name: { code: 'DUPLICATE_CODE', message: 'Ya existe un almacén con ese nombre' },
  uq_units_name: { code: 'DUPLICATE_CODE', message: 'Ya existe una unidad con ese nombre' },
  uq_product_categories_parent_name: { code: 'DUPLICATE_CODE', message: 'Ya existe una categoría con ese nombre en el mismo nivel' },
  uq_asset_categories_parent_name: { code: 'DUPLICATE_CODE', message: 'Ya existe una categoría con ese nombre en el mismo nivel' },
  uq_assets_category_name: { code: 'DUPLICATE_CODE', message: 'Ya existe un activo con ese nombre en la categoría' },
  chk_product_categories_parent: { code: 'CATEGORY_CYCLE', message: 'Una categoría no puede ser su propio padre' },
  chk_asset_categories_parent: { code: 'CATEGORY_CYCLE', message: 'Una categoría no puede ser su propio padre' },
  chk_product_categories_icon: { code: 'VALIDATION_ERROR', message: 'El icono no tiene un nombre válido' },
  chk_asset_categories_icon: { code: 'VALIDATION_ERROR', message: 'El icono no tiene un nombre válido' },
  chk_product_categories_icon_root: { code: 'VALIDATION_ERROR', message: 'Solo las categorías raíz llevan icono' },
  chk_asset_categories_icon_root: { code: 'VALIDATION_ERROR', message: 'Solo las categorías raíz llevan icono' },
  chk_products_min_stock: { code: 'VALIDATION_ERROR', message: 'El stock mínimo no puede ser negativo' },
  chk_products_max_stock: { code: 'VALIDATION_ERROR', message: 'El stock máximo no puede ser menor que el mínimo' },
  chk_units_factor: { code: 'VALIDATION_ERROR', message: 'El factor de conversión debe ser mayor que 0' },
  chk_units_base_factor: { code: 'VALIDATION_ERROR', message: 'Una unidad base debe tener factor de conversión 1' },
  chk_units_not_self_base: { code: 'VALIDATION_ERROR', message: 'Una unidad no puede ser su propia unidad base' },
});

// Los triggers lanzan 'CODIGO_DEL_CATALOGO: explicación' (ver migración 20261109000006).
const RAISED_CODE = /^([A-Z][A-Z0-9_]*)(?::\s*([\s\S]*))?$/;

const fromRaisedCode = (pg, cause) => {
  const match = typeof pg.message === 'string' ? pg.message.match(RAISED_CODE) : null;
  if (!match || !Object.hasOwn(ERROR_CATALOG, match[1])) return null;
  return new AppError(match[1], {
    message: match[2] || undefined,
    details: pg.detail ? { detail: pg.detail } : undefined,
    cause,
  });
};

const fromConstraint = (constraint, fallbackCode, cause) => {
  const mapped = constraint ? CONSTRAINT_MAP[constraint] : undefined;
  return new AppError(mapped?.code ?? fallbackCode, {
    message: mapped?.message,
    details: constraint ? { constraint } : undefined,
    cause,
  });
};

/**
 * Traduce un error de base de datos a AppError.
 * Devuelve null si no es un error de BD reconocible (el errorHandler lo tratará como INTERNAL_ERROR).
 */
export const mapDatabaseError = (err) => {
  if (!err || typeof err !== 'object') return null;

  if (err instanceof ConnectionError || err instanceof TimeoutError) {
    return new AppError('INTERNAL_ERROR', { message: 'Base de datos no disponible', cause: err });
  }

  // Sequelize envuelve el error de pg en .parent/.original; un error crudo de pg trae .severity.
  const pg = err.parent ?? err.original ?? (typeof err.severity === 'string' ? err : null);

  if (!pg) {
    // Validaciones de modelo de Sequelize (sin error de pg detrás).
    if (err instanceof ValidationError) {
      return new AppError('VALIDATION_ERROR', {
        details: err.errors.map((e) => ({ location: 'model', path: e.path, message: e.message })),
        cause: err,
      });
    }
    return null;
  }

  const constraint = pg.constraint ?? err.index ?? undefined;

  switch (pg.code) {
    case PG_CODES.RAISE:
      return fromRaisedCode(pg, err);

    case PG_CODES.CHECK:
      // Los triggers de regla de negocio usan ERRCODE 23514 con un código del catálogo en el mensaje.
      return fromRaisedCode(pg, err) ?? fromConstraint(constraint, 'VALIDATION_ERROR', err);

    case PG_CODES.UNIQUE:
      return fromConstraint(constraint, 'DUPLICATE_CODE', err);

    case PG_CODES.RESTRICT:
      // Todas las FKs de catálogos y movimientos usan ON DELETE RESTRICT (db_schema.md).
      return new AppError('HAS_DEPENDENCIES', { details: constraint ? { constraint } : undefined, cause: err });

    case PG_CODES.FOREIGN_KEY: {
      // Un DELETE que choca con una FK significa que el registro tiene dependencias; en INSERT o
      // UPDATE significa que el registro referenciado no existe. Se distingue por la sentencia
      // porque el texto del error viene traducido.
      const isDelete = /^\s*DELETE\b/i.test(err.sql ?? '');
      return new AppError(isDelete ? 'HAS_DEPENDENCIES' : 'NOT_FOUND', {
        message: isDelete ? undefined : 'Uno de los recursos referenciados no existe',
        details: constraint ? { constraint } : undefined,
        cause: err,
      });
    }

    case PG_CODES.NOT_NULL:
      return new AppError('VALIDATION_ERROR', {
        message: pg.column ? `El campo ${pg.column} es obligatorio` : undefined,
        details: pg.column ? { column: pg.column } : undefined,
        cause: err,
      });

    case PG_CODES.INVALID_TEXT:
    case PG_CODES.OUT_OF_RANGE:
    case PG_CODES.STRING_TOO_LONG:
      return new AppError('VALIDATION_ERROR', { message: 'Uno de los valores enviados no tiene el formato o tamaño permitido', cause: err });

    default:
      return null;
  }
};
