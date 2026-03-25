export const up = async (queryInterface, Sequelize) => {
  await queryInterface.createTable('role_privileges', {
    role_id: {
      type: Sequelize.INTEGER,
      allowNull: false, 
      references: {
        model: 'roles',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    },
    privilege_id: {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: {
        model: 'privileges',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
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
  await queryInterface.dropTable('role_privileges');
};