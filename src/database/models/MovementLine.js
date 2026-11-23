import { DataTypes } from 'sequelize';
import { sequelize } from '#src/config/database.js';

// Tabla movement_lines (db_schema.md §4). Un producto por línea y, si aplica, el activo que lo
// recibe; un producto se reparte entre activos con una línea por activo. NUMERIC(14,3) llega como texto.
export const MovementLine = sequelize.define('MovementLine', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  movementHeaderId: { type: DataTypes.INTEGER, allowNull: false },
  productId: { type: DataTypes.INTEGER, allowNull: false },
  quantity: { type: DataTypes.DECIMAL(14, 3), allowNull: false },
  assetId: { type: DataTypes.INTEGER, allowNull: true },
  note: { type: DataTypes.TEXT, allowNull: true },
}, {
  tableName: 'movement_lines',
  underscored: true,
  timestamps: false,
});
