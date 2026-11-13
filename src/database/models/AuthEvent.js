import { DataTypes } from 'sequelize';
import { sequelize } from '#src/config/database.js';
import { AUTH_EVENT_TYPES } from '#src/shared/constants/auth.js';

// Bitácora de seguridad (db_schema.md §2). Solo se insertan filas; no tiene updated_at.
export const AuthEvent = sequelize.define('AuthEvent', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  userId: { type: DataTypes.INTEGER, allowNull: true },
  usernameAttempted: { type: DataTypes.STRING(150), allowNull: true },
  eventType: { type: DataTypes.ENUM(...Object.values(AUTH_EVENT_TYPES)), allowNull: false },
  ipAddress: { type: DataTypes.INET, allowNull: true },
  userAgent: { type: DataTypes.STRING(255), allowNull: true },
}, {
  tableName: 'auth_events',
  underscored: true,
  updatedAt: false,
});
