export const up = async (queryInterface, Sequelize) => {
  await queryInterface.createTable('stocks', {
    id: {
      type: Sequelize.INTEGER,
      allowNull: false,
      autoIncrement: true,
      primaryKey: true
    },
    quantity: {
      type: Sequelize.FLOAT,
      allowNull: false,
      defaultValue: 0
    },
    product_id: {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: {
        model: 'products',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
    },
    warehouse_id: {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: {
        model: 'warehouses',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
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

  await queryInterface.addIndex('stocks', ['product_id', 'warehouse_id'], {
    unique: true,
    name: 'stocks_unique_product_warehouse'
  });
};

export const down = async (queryInterface, Sequelize) => {
  await queryInterface.dropTable('stocks');
}