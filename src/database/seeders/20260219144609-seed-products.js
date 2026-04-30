import { products} from "#src/shared/utils/products.js";

export const up = async (queryInterface, Sequelize) => {
  const now = new Date();

  await queryInterface.bulkInsert('products', [
    ...products.map(pd => ({
      ...pd,
      createdAt: now,
      updatedAt: now
    }))
  ], {});
};

export const down = async (queryInterface, Sequelize) => {
  await queryInterface.bulkDelete('products', null, {});
};