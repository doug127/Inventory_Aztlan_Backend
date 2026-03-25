export const up = async (queryInterface, Sequelize) => {
  await queryInterface.bulkInsert('warehouses', [
    {
      name: 'Almacen grande',
      code: 'AG01',
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      name: 'Almacen de Cosecha',
      code: 'AC02',
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      name: 'Almacen de taller',
      code: 'AT03',
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ]);
};

export const down = async (queryInterface, Sequelize) => {
  await queryInterface.bulkDelete('warehouses', null, {});
};
