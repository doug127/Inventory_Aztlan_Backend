import { DataTypes } from 'sequelize';
import { sequelize } from '#src/config/database.js';

// Tabla product_categories (db_schema.md §3). Árbol por autorreferencia (parent_id NULL = raíz).
// El código (4 letras) es el prefijo de los códigos de producto: LUBR → LUBR-0001.
export const ProductCategory = sequelize.define('ProductCategory', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  code: { type: DataTypes.STRING(4), allowNull: false, unique: true },
  name: { type: DataTypes.STRING(100), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  parentId: { type: DataTypes.INTEGER, allowNull: true },
  // Icono de lucide (HU-301). Solo en las raíces; las subcategorías muestran el de su raíz.
  icon: { type: DataTypes.STRING(40), allowNull: true },
  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
}, {
  tableName: 'product_categories',
  underscored: true,
});
