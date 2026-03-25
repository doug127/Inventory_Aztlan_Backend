import { DataTypes } from 'sequelize';
import {sequelize} from '../config/database.js';

export const Privilege = sequelize.define('privileges', {
  id: { 
    type: DataTypes.INTEGER, 
    primaryKey: true, 
    autoIncrement: true 
  },
  name: { 
    type: DataTypes.STRING, 
    unique: true, 
    allowNull: false
  },
  hierarchy: { 
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

export default Privilege;
