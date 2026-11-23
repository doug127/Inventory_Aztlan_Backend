import { DataTypes } from 'sequelize';
import { sequelize } from '#src/config/database.js';
import { MOVEMENT_REASONS, MOVEMENT_TYPES } from '#src/shared/constants/movements.js';

// Tabla movement_headers (db_schema.md §4). Inmutable: trg_movements_immutable rechaza UPDATE y
// DELETE. Los CHECK de almacenes, motivo, prefijo del documento y received_by están en la migración.
export const MovementHeader = sequelize.define('MovementHeader', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  documentNumber: { type: DataTypes.STRING(10), allowNull: false, unique: true },
  movementType: { type: DataTypes.ENUM(...Object.values(MOVEMENT_TYPES)), allowNull: false },
  reason: { type: DataTypes.ENUM(...Object.values(MOVEMENT_REASONS)), allowNull: false },
  reference: { type: DataTypes.STRING(100), allowNull: true },
  // Orden de trabajo del taller (OT-2026-0153). Solo en órdenes de retiro.
  workOrder: { type: DataTypes.STRING(30), allowNull: true },
  movementDate: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  createdByUserId: { type: DataTypes.INTEGER, allowNull: false },
  warehouseFromId: { type: DataTypes.INTEGER, allowNull: true },
  warehouseToId: { type: DataTypes.INTEGER, allowNull: true },
  receivedBy: { type: DataTypes.STRING(150), allowNull: true },
  note: { type: DataTypes.TEXT, allowNull: true },
  idempotencyKey: { type: DataTypes.UUID, allowNull: true, unique: true },
}, {
  tableName: 'movement_headers',
  underscored: true,
  // Solo created_at: un movimiento no se actualiza.
  updatedAt: false,
});
