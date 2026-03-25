export const up = async (queryInterface, Sequelize) => {
  await queryInterface.createTable('movement_headers', {
    id: {
      type: Sequelize.INTEGER,
      allowNull: false,
      autoIncrement: true,
      primaryKey: true
    },
    movement_type_id: {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: {
        model: 'movement_types',
        key: 'id'
      },
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE'
    },
    reason_id: {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: {
        model: 'reasons',
        key: 'id'
      },
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE'
    },
    reference: {
      type: Sequelize.STRING,
      allowNull: true
    },
    datetime: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.NOW
    },
    created_by_user_id: {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      },
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE'
    },
    warehouse_from_id: {
      type: Sequelize.INTEGER,
      references: {
        model: 'warehouses',
        key: 'id'
      },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE'
    },
    warehouse_to_id: {
      type: Sequelize.INTEGER,
      references: {
        model: 'warehouses',
        key: 'id'
      },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE'
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
  await queryInterface.addIndex('movement_headers', ['datetime']);
};

export const down = async (queryInterface, Sequelize) => {
  await queryInterface.dropTable('movement_headers');
}