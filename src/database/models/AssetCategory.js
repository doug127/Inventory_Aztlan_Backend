import { DataTypes } from 'sequelize';
import { sequelize } from '#src/config/database.js';

// Tabla asset_categories (db_schema.md §3). Árbol por autorreferencia (parent_id NULL = raíz):
// VEHICULOS › MAQUINARIA_AGRICOLA › TRACTOR. Los activos solo van en las hojas (HU-301, HU-302).
export const AssetCategory = sequelize.define('AssetCategory', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  code: { type: DataTypes.STRING(20), allowNull: false, unique: true },
  name: { type: DataTypes.STRING(100), allowNull: false },
  parentId: { type: DataTypes.INTEGER, allowNull: true },
  // Icono de lucide. Solo en las raíces; las subcategorías muestran el de su raíz.
  icon: { type: DataTypes.STRING(40), allowNull: true },
  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
}, {
  tableName: 'asset_categories',
  underscored: true,
});
