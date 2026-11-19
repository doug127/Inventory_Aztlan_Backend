// Utilidades comunes a los dos árboles de categorías: productos (HU-203) y activos (HU-301).
import { AppError } from '#src/shared/errors/AppError.js';

/**
 * Arma el árbol en memoria a partir de la lista plana en O(n), sin una consulta por nivel.
 *  - isActive: si se indica, omite las ramas con otro estado (una categoría inactiva no tiene hijas activas).
 *  - countOf(row): elementos propios de la categoría (productos o activos), para el total de la rama.
 * Cada nodo recibe depth, children, subtreeCount (propios + los de toda la rama) y displayIcon (el
 * icono de su raíz, que es la única que lo guarda).
 */
export const buildCategoryTree = (rows, { isActive, countOf }) => {
  const childrenOf = new Map();
  for (const row of rows) {
    if (isActive !== undefined && row.isActive !== isActive) continue;
    const key = row.parentId ?? null;
    if (!childrenOf.has(key)) childrenOf.set(key, []);
    childrenOf.get(key).push(row);
  }
  const visited = new Set();
  const attach = (row, depth, displayIcon) => {
    visited.add(row.id);
    const children = (childrenOf.get(row.id) ?? [])
      .filter((child) => !visited.has(child.id))
      .map((child) => attach(child, depth + 1, displayIcon));
    const subtreeCount = Number(countOf(row) ?? 0) + children.reduce((sum, child) => sum + child.subtreeCount, 0);
    return { ...row, depth, children, subtreeCount, displayIcon };
  };
  return (childrenOf.get(null) ?? []).map((root) => attach(root, 0, root.icon ?? null));
};

/**
 * Solo las categorías raíz guardan icono. Devuelve el icono que debe quedar guardado, o undefined
 * si no cambia.
 *  - Si la categoría queda dentro de otra y se pidió un icono, responde VALIDATION_ERROR en `icon`.
 *  - Si pasa de raíz a subcategoría, su icono se borra: muestra el de su nueva raíz.
 * current: icono guardado (null al crear). requested: el enviado (undefined = no se envió).
 */
export const resolveCategoryIcon = ({ current = null, requested, parentId }) => {
  if (parentId !== null) {
    if (requested) {
      const message = 'Solo las categorías raíz llevan icono: las subcategorías muestran el de su raíz';
      throw new AppError('VALIDATION_ERROR', { message, details: [{ location: 'body', path: 'icon', message }] });
    }
    return current ? null : undefined;
  }
  if (requested === undefined || requested === current) return undefined;
  return requested;
};
