import { DataTypes } from 'sequelize';
import {sequelize} from '../config/database.js';

export const Role = sequelize.define('roles', {
    id: { 
        type: DataTypes.INTEGER, 
        primaryKey: true, 
        autoIncrement: true 
    },
    name: { 
        type: DataTypes.STRING, 
        unique: true 
    },
    hierarchy_level: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    description: { 
        type: DataTypes.STRING 
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
