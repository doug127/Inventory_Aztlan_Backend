export const up = async (queryInterface, Sequelize) => {
  const now = new Date();

  const targets = [
    {
      movement_header_id: 1,
      asset_id: 1,
      createdAt: now,
      updatedAt: now
    }
  ];

  await queryInterface.bulkInsert('movement_targets', targets, {});
}

export const down = async (queryInterface, Sequelize) => {
  await queryInterface.bulkDelete('movement_targets', null, {});
}
