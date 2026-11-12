// Catálogo único de códigos de error. Debe coincidir con documentation/naming_conventions.md §11.
// El código es el contrato con el frontend y con el asistente IA; el mensaje es para humanos.
export const ERROR_CATALOG = Object.freeze({
  // Autenticación
  AUTH_INVALID_CREDENTIALS:      { status: 401, message: 'Usuario o contraseña incorrectos' },
  AUTH_ACCOUNT_LOCKED:           { status: 423, message: 'Cuenta bloqueada temporalmente' },
  AUTH_ACCOUNT_INACTIVE:         { status: 403, message: 'Usuario desactivado' },
  AUTH_TOKEN_MISSING:            { status: 401, message: 'Se requiere autenticación' },
  AUTH_TOKEN_EXPIRED:            { status: 401, message: 'La sesión expiró' },
  AUTH_TOKEN_INVALID:            { status: 401, message: 'Token inválido o revocado' },
  AUTH_PASSWORD_CHANGE_REQUIRED: { status: 403, message: 'Debe cambiar la contraseña antes de continuar' },
  AUTH_RESET_TOKEN_INVALID:      { status: 400, message: 'El enlace de recuperación no es válido o expiró' },
  AUTH_WEAK_PASSWORD:            { status: 400, message: 'La contraseña no cumple la política' },
  AUTH_RATE_LIMITED:             { status: 429, message: 'Demasiadas solicitudes, intente más tarde' },

  // Permisos
  FORBIDDEN_ROLE:                { status: 403, message: 'Su rol no permite esta acción' },
  FORBIDDEN_HIERARCHY:           { status: 403, message: 'No puede gestionar un usuario de rango igual o superior' },
  LAST_SUPERADMIN:               { status: 409, message: 'Debe existir al menos un superadministrador activo' },

  // Movimientos
  INSUFFICIENT_STOCK:            { status: 409, message: 'Stock insuficiente' },
  INVALID_MOVEMENT_WAREHOUSES:   { status: 400, message: 'Almacenes no válidos para el tipo de movimiento' },
  INVALID_MOVEMENT_REASON:       { status: 400, message: 'Motivo no permitido para el tipo de movimiento' },
  ASSET_REQUIRED:                { status: 400, message: 'La línea requiere un activo destino' },
  ASSET_NOT_ALLOWED:             { status: 400, message: 'La línea no debe tener activo' },
  RETURN_EXCEEDS_LOAN:           { status: 409, message: 'La devolución supera lo prestado pendiente' },
  MOVEMENT_DATE_INVALID:         { status: 400, message: 'Fecha del movimiento fuera del rango permitido' },
  MOVEMENT_IMMUTABLE:            { status: 409, message: 'Los movimientos no se modifican ni eliminan' },
  EMPTY_MOVEMENT:                { status: 400, message: 'El movimiento no tiene líneas' },
  // 409 solo cuando el UNIQUE detecta una carrera. Si el service encuentra la clave antes de
  // insertar, no lanza error: devuelve el movimiento original con 200.
  DUPLICATE_REQUEST:             { status: 409, message: 'La solicitud ya fue procesada' },

  // Catálogos
  NOT_FOUND:                     { status: 404, message: 'Recurso no encontrado' },
  INACTIVE_RESOURCE:             { status: 409, message: 'El recurso está desactivado' },
  DUPLICATE_CODE:                { status: 409, message: 'El código ya existe' },
  INVALID_CODE_FORMAT:           { status: 400, message: 'El código no cumple el formato' },
  CATEGORY_CYCLE:                { status: 409, message: 'El cambio crearía un ciclo de categorías' },
  CATEGORY_NOT_LEAF:             { status: 409, message: 'Los activos solo van en categorías hoja' },
  CATEGORY_HAS_ASSETS:           { status: 409, message: 'La categoría tiene activos y no admite subcategorías' },
  HAS_STOCK:                     { status: 409, message: 'No se puede desactivar: tiene existencias' },
  HAS_DEPENDENCIES:              { status: 409, message: 'No se puede desactivar: tiene elementos asociados' },
  UNIT_CHANGE_FORBIDDEN:         { status: 409, message: 'No se puede cambiar la unidad de un producto con movimientos' },

  // Generales
  VALIDATION_ERROR:              { status: 400, message: 'Error de validación de campos' },
  ROUTE_NOT_FOUND:               { status: 404, message: 'Ruta no encontrada' },
  RESPONSE_CONTRACT_ERROR:       { status: 500, message: 'Error interno del servidor' },
  INTERNAL_ERROR:                { status: 500, message: 'Error interno del servidor' },
});

export const ERROR_CODES = Object.freeze(
  Object.fromEntries(Object.keys(ERROR_CATALOG).map((code) => [code, code]))
);
