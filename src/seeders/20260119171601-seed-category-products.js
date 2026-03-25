import { categories } from "../utils/categories.js";

export const up = async (queryInterface, Sequelize) => {
  await queryInterface.bulkInsert('category_products', [
    categories.map(category => ({
      name: category.name,
      description: category.description,
      parent_id: category.parent_id,
      createdAt: new Date(),
      updatedAt: new Date()
    }))
  ].flat(), {});
};

export const down = async (queryInterface, Sequelize) => {
  await queryInterface.bulkDelete('category_products', null, {});
};