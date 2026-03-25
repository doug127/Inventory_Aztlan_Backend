import { DataTypes } from "sequelize";
import { sequelize } from "../config/database.js";

export const Product = sequelize.define("products", {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
    }, 
    name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    code: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    },  
    content_quantity: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 1
    },
    min_stock: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0
    },
    max_stock: {    
        type: DataTypes.FLOAT,
        allowNull: true,
        defaultValue: null
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
    },
    product_category_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'category_products',
            key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
    },
    unit_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'units',
            key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
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