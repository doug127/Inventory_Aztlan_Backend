import { DataTypes } from 'sequelize';
import { sequelize } from '#src/config/database.js';

// Tabla assets (db_schema.md §3). Destino de los consumos: tractores, tablones, personal, talleres.
// Solo código, nombre y categoría hoja (business_rules.md §6.5); trg_assets_leaf_category lo respalda.
export const Asset = sequelize.define('Asset', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  code: { type: DataTypes.STRING(10), allowNull: false, unique: true },
  name: { type: DataTypes.STRING(100), allowNull: false },
  assetCategoryId: { type: DataTypes.INTEGER, allowNull: false },
  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
}, {
  tableName: 'assets',
  underscored: true,
});
