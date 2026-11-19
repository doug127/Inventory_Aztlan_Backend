import { z } from 'zod';

const CategoryRefDto = z.object({ id: z.number().int(), code: z.string(), name: z.string(), isActive: z.boolean() });

const UsageDto = z.object({
  activeChildren: z.number().int(),
  totalChildren: z.number().int(),
  activeProducts: z.number().int(),
  totalProducts: z.number().int(),
});

export const CategoryDto = z.object({
  id: z.number().int(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  // Icono propio (solo las raíces) y el que se muestra (el de la raíz de su rama).
  icon: z.string().nullable(),
  displayIcon: z.string().nullable(),
  isActive: z.boolean(),
  parent: CategoryRefDto.nullable(),
  // Sin hijas. Los productos se asignan preferiblemente a categorías hoja (naming_conventions.md §6.1).
  isLeaf: z.boolean(),
  usage: UsageDto,
  createdAt: z.date(),
  updatedAt: z.date(),
});

/** Ficha: además, la ruta desde la raíz y las hijas directas. */
export const CategoryDetailDto = CategoryDto.extend({
  path: z.array(CategoryRefDto),
  children: z.array(CategoryRefDto),
});

/** Nodo del árbol. productsInSubtree cuenta los de la categoría y todas sus subcategorías. */
export const CategoryTreeNodeDto = CategoryDto.extend({
  depth: z.number().int(),
  productsInSubtree: z.number().int(),
  get children() {
    return z.array(CategoryTreeNodeDto);
  },
});

const toRef = (c) => ({ id: c.id, code: c.code, name: c.name, isActive: c.isActive });

const baseFields = (category) => {
  const usage = {
    activeChildren: Number(category.activeChildren ?? 0),
    totalChildren: Number(category.totalChildren ?? 0),
    activeProducts: Number(category.activeProducts ?? 0),
    totalProducts: Number(category.totalProducts ?? 0),
  };
  return {
    id: category.id,
    code: category.code,
    name: category.name,
    description: category.description ?? null,
    icon: category.icon ?? null,
    displayIcon: category.displayIcon ?? category.rootIcon ?? category.icon ?? null,
    isActive: category.isActive,
    parent: category.parent ? toRef(category.parent) : null,
    isLeaf: usage.totalChildren === 0,
    usage,
    createdAt: new Date(category.createdAt),
    updatedAt: new Date(category.updatedAt),
  };
};

export const toCategoryDto = (category) => CategoryDto.parse(baseFields(category));

export const toCategoryDetailDto = (category, { path, children }) =>
  CategoryDetailDto.parse({ ...baseFields(category), path: path.map(toRef), children: children.map(toRef) });

/**
 * roots: categorías anidadas por buildCategoryTree, cada una con { depth, subtreeCount, displayIcon, children }. Se valida
 * el árbol completo una sola vez.
 */
export const toCategoryTreeDto = (roots) => {
  const shape = (node) => ({
    ...baseFields(node),
    depth: node.depth,
    productsInSubtree: node.subtreeCount,
    children: node.children.map(shape),
  });
  return z.array(CategoryTreeNodeDto).parse(roots.map(shape));
};
