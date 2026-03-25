import { DataTypes } from 'sequelize';
import {sequelize} from '../config/database.js';

export const User = sequelize.define('users', {
    id: {   
        type: DataTypes.INTEGER, 
        primaryKey: true, 
        autoIncrement: true 
    },
    fullname: { 
        type: DataTypes.STRING, 
        allowNull: false 
    },
    username: { 
        type: DataTypes.STRING, 
        unique: true, 
        allowNull: false 
    },
    password: { 
        type: DataTypes.STRING, 
        allowNull: false 
    },
    role_id: { 
        type: DataTypes.INTEGER, 
        allowNull: false 
    },
    is_active: { 
        type: DataTypes.BOOLEAN, 
        defaultValue: true 
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
