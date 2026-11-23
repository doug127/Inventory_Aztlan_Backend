import { DataTypes } from 'sequelize';
import { sequelize } from '#src/config/database.js';

// Tabla stock (db_schema.md §4): saldo vigente por producto y almacén. Solo la modifica el service de
// movimientos, con las filas bloqueadas FOR UPDATE; el CHECK (quantity >= 0) es la última barrera.
export const Stock = sequelize.define('Stock', {
  productId: { type: DataTypes.INTEGER, primaryKey: true },
  warehouseId: { type: DataTypes.INTEGER, primaryKey: true },
  quantity: { type: DataTypes.DECIMAL(14, 3), allowNull: false, defaultValue: 0 },
  lastUpdate: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, {
  tableName: 'stock',
  underscored: true,
  timestamps: false,
});
