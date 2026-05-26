import { DataTypes } from "sequelize";
import { sequelize } from "#src/config/database.js";

export const Warehouse = sequelize.define('warehouses', {   
    id: { 
        type: DataTypes.INTEGER, 
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
    },
    name: { 
        type: DataTypes.STRING, 
        allowNull: false    
    },
    code: { 
        type: DataTypes.CHAR(4),    
        allowNull: false,
        unique: true
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