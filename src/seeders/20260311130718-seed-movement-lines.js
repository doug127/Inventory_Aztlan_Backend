export const up = async (queryInterface, Sequelize) => {
    const now = new Date();

    const lines = [
        {
          movement_header_id: 1,
          product_id: 1,
          quantity: 20,
          createdAt: now,
          updatedAt: now
        },
        {
          movement_header_id: 2,
          product_id: 3,
          quantity: 50,
          createdAt: now,
          updatedAt: now
        },
        {
          movement_header_id: 3,
          product_id: 4,
          quantity: 19,
          createdAt: now,
          updatedAt: now
        },
        {
          movement_header_id: 4,
          product_id: 2,
          quantity: -30,
          createdAt: now,
          updatedAt: now
        }
    ]

    await queryInterface.bulkInsert("movement_lines", lines, {});
}

export const down = async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete("movement_lines", lines, {});
}