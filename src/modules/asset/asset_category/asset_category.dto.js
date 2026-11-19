import { z } from 'zod';

const CategoryRefDto = z.object({ id: z.number().int(), code: z.string(), name: z.string(), isActive: z.boolean() });

const UsageDto = z.object({
  activeChildren: z.number().int(),
  totalChildren: z.number().int(),
  activeAssets: z.number().int(),
  totalAssets: z.number().int(),
});

export const AssetCategoryDto = z.object({
  id: z.number().int(),
  code: z.string(),
  name: z.string(),
  // Icono propio (solo las raíces) y el que se muestra (el de la raíz de su rama).
  icon: z.string().nullable(),
  displayIcon: z.string().nullable(),
  isActive: z.boolean(),
  parent: CategoryRefDto.nullable(),
  // Sin hijas: puede recibir activos (business_rules.md §6.2 regla 4).
  isLeaf: z.boolean(),
  // Sin activos: puede recibir subcategorías.
  acceptsChildren: z.boolean(),
  usage: UsageDto,
  createdAt: z.date(),
  updatedAt: z.date(),
});

/** Ficha: además, la ruta desde la raíz y las hijas directas. */
export const AssetCategoryDetailDto = AssetCategoryDto.extend({
  path: z.array(CategoryRefDto),
  children: z.array(CategoryRefDto),
});

/** Nodo del árbol. assetsInSubtree cuenta los de la categoría y todas sus subcategorías. */
export const AssetCategoryTreeNodeDto = AssetCategoryDto.extend({
  depth: z.number().int(),
  assetsInSubtree: z.number().int(),
  get children() {
    return z.array(AssetCategoryTreeNodeDto);
  },
});

const toRef = (c) => ({ id: c.id, code: c.code, name: c.name, isActive: c.isActive });

const baseFields = (category) => {
  const usage = {
    activeChildren: Number(category.activeChildren ?? 0),
    totalChildren: Number(category.totalChildren ?? 0),
    activeAssets: Number(category.activeAssets ?? 0),
    totalAssets: Number(category.totalAssets ?? 0),
  };
  return {
    id: category.id,
    code: category.code,
    name: category.name,
    icon: category.icon ?? null,
    displayIcon: category.displayIcon ?? category.rootIcon ?? category.icon ?? null,
    isActive: category.isActive,
    parent: category.parent ? toRef(category.parent) : null,
    isLeaf: usage.totalChildren === 0,
    acceptsChildren: usage.totalAssets === 0,
    usage,
    createdAt: new Date(category.createdAt),
    updatedAt: new Date(category.updatedAt),
  };
};

export const toAssetCategoryDto = (category) => AssetCategoryDto.parse(baseFields(category));

export const toAssetCategoryDetailDto = (category, { path, children }) =>
  AssetCategoryDetailDto.parse({ ...baseFields(category), path: path.map(toRef), children: children.map(toRef) });

/** roots: categorías anidadas por buildCategoryTree. Se valida el árbol completo una sola vez. */
export const toAssetCategoryTreeDto = (roots) => {
  const shape = (node) => ({
    ...baseFields(node),
    depth: node.depth,
    assetsInSubtree: node.subtreeCount,
    children: node.children.map(shape),
  });
  return z.array(AssetCategoryTreeNodeDto).parse(roots.map(shape));
};
