import { DataTypes } from 'sequelize';
import { sequelize } from '#src/config/database.js';

// Tabla warehouses (db_schema.md §3). El código es de 4 caracteres en mayúsculas (chk_warehouses_code).
export const Warehouse = sequelize.define('Warehouse', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  code: { type: DataTypes.STRING(4), allowNull: false, unique: true },
  name: { type: DataTypes.STRING(100), allowNull: false, unique: true },
  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
}, {
  tableName: 'warehouses',
  underscored: true,
});
