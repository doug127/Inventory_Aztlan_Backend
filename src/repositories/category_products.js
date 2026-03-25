import { CategoryProduct } from "../models/CategoryProduct.js";
// import { Product } from "../models/Product.js";
import { Op } from "sequelize";

export const getAllCategoryProductsRepository = async () => {
  return await CategoryProduct.findAll({
    attributes: ['name', 'description', 'parent_id'],
    order: [['name', 'ASC']]
  });
};

export const getAllDescendantsRepository = async (id) => {
  return await CategoryProduct.findAll({
    where: { parent_id: id },
    attributes: ['id', 'name', 'parent_id']
  });
};

export const getCategoryProductByNameRepository = async (name) => {
  return await CategoryProduct.findOne({
    where: {
      name: { [Op.iLike]: name } 
    }
  });
};

export const getCategoryProductByIdRepository = async (id) => {
  return await CategoryProduct.findByPk(id, {
    attributes: ['id', 'name', 'description', 'parent_id']
  });
};

export const createCategoryProductRepository = async ({ name, description, parent_id }) => {
  return await CategoryProduct.create({ name, description, parent_id: parent_id ?? null});
};

export const updateCategoryProductRepository = async (id, data) => {
  const category = await CategoryProduct.findByPk(id);
  if (!category) throw new Error('Categoria no encontrada');
  await category.update(data);
  return category;
};

export const deleteCategoryProductRepository = async (id) => {
  const category = await CategoryProduct.findByPk(id);
  if (!category) throw new Error('Categoria no encontrada');
  await category.destroy();
};

export const hasCategoryChildrenRepository = async (id) => {
  const count = await CategoryProduct.count({ where: { parent_id: id } });
  return count > 0;
};

// * Habilitar cuando se implemente el modelo de Producto
// export const hasProductsInCategoryRepository = async (id) => {
//   const count = await Product.count({ where: { product_category_id: id } });
//   return count > 0;
// };