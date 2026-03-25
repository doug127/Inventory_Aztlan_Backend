export const up = async (queryInterface, Sequelize) => {
    await queryInterface.createTable("assets", {
        id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          autoIncrement: true,
          primaryKey: true
        },
        name: {
          type: Sequelize.STRING,
          allowNull: false
        },
        asset_type_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 'asset_types',
            key: 'id'
          },
          onUpdate: "CASCADE",
          onDelete: "RESTRICT"
        },
        active: {
          type: Sequelize.BOOLEAN,
          defaultValue: true,
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
    await queryInterface.dropTable('assets');
}