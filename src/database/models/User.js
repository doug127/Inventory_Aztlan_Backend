import { DataTypes } from 'sequelize';
import { sequelize } from '#src/config/database.js';

// Tabla users (db_schema.md §1). passwordHash nunca sale por defecto: solo el repository de auth
// lo pide explícitamente con User.unscoped().
export const User = sequelize.define('User', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  username: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  email: { type: DataTypes.STRING(150), allowNull: false, unique: true },
  passwordHash: { type: DataTypes.STRING(255), allowNull: false },
  fullName: { type: DataTypes.STRING(150), allowNull: false },
  roleId: { type: DataTypes.INTEGER, allowNull: false },
  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  emailVerifiedAt: { type: DataTypes.DATE, allowNull: true },
  passwordChangedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  mustChangePassword: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  failedLoginAttempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  lockedUntil: { type: DataTypes.DATE, allowNull: true },
  lastLoginAt: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'users',
  underscored: true,
  defaultScope: { attributes: { exclude: ['passwordHash'] } },
});
