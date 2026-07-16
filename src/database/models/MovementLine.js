import { DataTypes} from 'sequelize';
import { sequelize } from '#src/config/database.js';

export const MovementLine = sequelize.define('movement_lines', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
    },
    movement_header_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'movement_headers',
            key: 'id'
        },
        onDelete: 'CASCADE'
    },
    product_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'products',
            key: 'id'
        }
    },
    quantity: {
        type: DataTypes.FLOAT,
        allowNull: false,
        validate: {
            min: 1
        }
    },
    note: {
        type: DataTypes.TEXT,   
        allowNull: true
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
});