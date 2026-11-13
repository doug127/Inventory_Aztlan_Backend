import { DataTypes } from 'sequelize';
import { sequelize } from '#src/config/database.js';

// Tabla roles (db_schema.md §1). La app compara por code o hierarchy, nunca por name.
export const Role = sequelize.define('Role', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  code: { type: DataTypes.STRING(30), allowNull: false, unique: true },
  name: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  description: { type: DataTypes.TEXT, allowNull: true },
  hierarchy: { type: DataTypes.SMALLINT, allowNull: false, unique: true },
  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
}, {
  tableName: 'roles',
  underscored: true,
});
