export const up = async (queryInterface, Sequelize) => {
    await queryInterface.createTable("movement_targets", {
        id: {
           type: Sequelize.INTEGER,
           allowNull: false,
           primaryKey: true,
           autoIncrement: true
        },
        movement_header_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: {
                model: "movement_headers",
                key: "id"
            },
            onUpdate: "CASCADE",
            onDelete: "RESTRICT"
        },
        asset_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: {
                model: "assets",
                key: "id"
            },
            onUpdate: "CASCADE",
            onDelete: "RESTRICT"
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

    await queryInterface.addIndex('movement_targets', ['movement_header_id', 'asset_id'], {
        unique: true,
        name: 'movement_targets_unique_movement_headers_assets'
    });
}

export const down = async (queryInterface, Sequelize) => {
    await queryInterface.dropTable("movement_targets");
}