import { AppError } from '../errors/AppError.js';
import { ROLE_CODES, ROLE_HIERARCHY } from '../constants/roles.js';

// Nombres antiguos (ROLE_NAMES) que aún usan las rutas hasta el refactor REF-S1.
const LEGACY_ROLE_NAMES = { superadmin: ROLE_CODES.SUPERADMIN, admin: ROLE_CODES.ADMIN, user: ROLE_CODES.USUARIO };

const toRoleCode = (role) => {
  const value = String(role ?? '');
  return ROLE_CODES[value.toUpperCase()] ?? LEGACY_ROLE_NAMES[value.toLowerCase()];
};

// Jerarquía del usuario autenticado. Falla cerrado: si el token no la trae, no hay acceso.
const userHierarchy = (user) => {
  const value = user?.hierarchy ?? user?.role?.hierarchy;
  if (Number.isInteger(value)) return value;
  const code = toRoleCode(user?.roleCode ?? user?.role_code ?? user?.role?.code);
  return code ? ROLE_HIERARCHY[code] : undefined;
};

/**
 * Control de acceso grueso por rol mínimo: deja pasar al rol indicado y a los de mayor rango.
 * Recuerda que hierarchy 0 = mayor rango. El control fino (jerarquía sobre otro usuario,
 * ajustes, fechas atrasadas) va en el service.
 */
export const authorizeRole = (minRole) => {
  const minCode = toRoleCode(minRole);
  if (!minCode) throw new Error(`authorizeRole: rol desconocido "${minRole}"`);
  const minHierarchy = ROLE_HIERARCHY[minCode];

  return (req, _res, next) => {
    const hierarchy = userHierarchy(req.user);
    if (hierarchy === undefined || hierarchy > minHierarchy) {
      return next(new AppError('FORBIDDEN_ROLE', { details: { requiredRole: minCode } }));
    }
    return next();
  };
};
