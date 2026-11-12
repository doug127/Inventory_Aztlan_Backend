// Fuente única de los roles. Se compara siempre por code o hierarchy, nunca por el nombre visible.
// hierarchy: 0 = mayor rango (business_rules.md §8.1).
export const ROLE_CODES = Object.freeze({
  SUPERADMIN: 'SUPERADMIN',
  ADMIN: 'ADMIN',
  ALMACENISTA: 'ALMACENISTA',
  USUARIO: 'USUARIO',
});

export const ROLE_HIERARCHY = Object.freeze({
  SUPERADMIN: 0,
  ADMIN: 1,
  ALMACENISTA: 2,
  USUARIO: 3,
});
