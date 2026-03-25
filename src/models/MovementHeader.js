import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

export const MovementHeader = sequelize.define('movement_headers', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
    },
    movement_type_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'movement_types',
            key: 'id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE'
    },
    reason_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'reasons',
            key: 'id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE'
    },
    reference: {
        type: DataTypes.STRING,
        allowNull: true
    },
    datetime: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    },
    created_by_user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'users',
            key: 'id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE'
    },
    warehouse_from_id: {
        type: DataTypes.INTEGER,
        references: {
            model: 'warehouses',
            key: 'id'
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE'
    },
    warehouse_to_id: {
        type: DataTypes.INTEGER,
        references: {
            model: 'warehouses',
            key: 'id'
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE'
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
} );