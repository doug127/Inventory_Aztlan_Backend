export const up = async (queryInterface, Sequelize) => {
  await queryInterface.createTable("movement_types", {
    id: {
      type: Sequelize.INTEGER,
      primaryKey: true,
      allowNull: false,
      autoIncrement: true
    },
    type: {
      type: Sequelize.TEXT, 
      allowNull: false
    },
    createdAt: {
      type: Sequelize.DATE, 
      allowNull: false,
      defaultValue: Sequelize.NOW
    },
    updatedAt: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.NOW
    }
  });
}

export const down = async (queryInterface, Sequelize) => {
  await queryInterface.dropTable("movement_types");
}