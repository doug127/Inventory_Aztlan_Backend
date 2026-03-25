export const up = async (queryInterface, Sequelize) => {
  const now = new Date();

  const types = ['ENTRADA', 'SALIDA', 'TRANSFERENCIA', 'AJUSTE', 'OTRO'];

  const movement_types = types.map((type) => ({
    type,
    createdAt: now,
    updatedAt: now
  }));

  await queryInterface.bulkInsert("movement_types", movement_types, {})
}

export const down = async (queryInterface, Sequelize) => {
  await queryInterface.bulkDelete("movement_types", null, {});
}