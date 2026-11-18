import { DataTypes } from 'sequelize';
import { sequelize } from '#src/config/database.js';

// Tabla units (db_schema.md §3). Una unidad base tiene base_unit_id NULL y factor 1; una derivada
// indica a cuántas unidades base equivale (TAMB = 208 L). El factor es NUMERIC(18,6): pg lo
// devuelve como string y se opera con decimal.js.
export const Unit = sequelize.define('Unit', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  code: { type: DataTypes.STRING(10), allowNull: false, unique: true },
  name: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  baseUnitId: { type: DataTypes.INTEGER, allowNull: true },
  conversionFactor: { type: DataTypes.DECIMAL(18, 6), allowNull: false, defaultValue: 1 },
  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
}, {
  tableName: 'units',
  underscored: true,
});
