export const up = async (queryInterface, Sequelize) => {
  await queryInterface.createTable('movement_lines', {
    id: {
      type: Sequelize.INTEGER,
      allowNull: false,
      autoIncrement: true,
      primaryKey: true
    },
    movement_header_id: {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: {
        model: 'movement_headers',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    product_id: {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: {
        model: 'products',
        key: 'id'
      }
    },
    quantity: {
      type: Sequelize.FLOAT,
      allowNull: false, 
      validate: {
        min: 1
      }
    },
    note: {
      type: Sequelize.TEXT,
      allowNull: true
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
};

export const down = async (queryInterface, Sequelize) => {
  await queryInterface.dropTable('movement_lines');
};