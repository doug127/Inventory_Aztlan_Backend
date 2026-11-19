import { DataTypes } from 'sequelize';
import { sequelize } from '#src/config/database.js';

// Tabla products (db_schema.md §3). El código es {código de categoría}-{NNNN} (chk_products_code).
// min_stock y max_stock son NUMERIC(14,3): pg los devuelve como string y se operan con decimal.js.
export const Product = sequelize.define('Product', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  code: { type: DataTypes.STRING(30), allowNull: false, unique: true },
  name: { type: DataTypes.STRING(150), allowNull: false },
  productCategoryId: { type: DataTypes.INTEGER, allowNull: false },
  unitId: { type: DataTypes.INTEGER, allowNull: false },
  minStock: { type: DataTypes.DECIMAL(14, 3), allowNull: false, defaultValue: 0 },
  maxStock: { type: DataTypes.DECIMAL(14, 3), allowNull: true },
  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
}, {
  tableName: 'products',
  underscored: true,
});
