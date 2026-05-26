import { DataTypes } from "sequelize";
import { sequelize } from "#src/config/database.js";

export const MovementTarget = sequelize.define("movement_targets", {
    id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true
    },
    movement_header_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: "movement_headers",
            key: "id"
        },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT"
    },
    asset_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: "assets",
            key: "id"
        },
        onUpdate: "CASCADE",
        onDelete: "RESTRICT"
    },
    createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    },
    updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    }
}, {
    indexes: [
        {
            unique: true,
            fields: ['movement_header_id', 'asset_id']
        }
    ], 
    timestamps: true
});