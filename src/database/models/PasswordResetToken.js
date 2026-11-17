import { DataTypes } from 'sequelize';
import { sequelize } from '#src/config/database.js';

// Tabla password_reset_tokens (db_schema.md §2). Solo guarda el SHA-256 del token; el token en
// claro existe únicamente dentro del correo. Un índice parcial (uq_reset_token_active) permite un
// solo token vigente por usuario. Nota: pg devuelve BIGINT como string.
export const PasswordResetToken = sequelize.define('PasswordResetToken', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  userId: { type: DataTypes.INTEGER, allowNull: false },
  tokenHash: { type: DataTypes.STRING(255), allowNull: false, unique: true },
  expiresAt: { type: DataTypes.DATE, allowNull: false },
  usedAt: { type: DataTypes.DATE, allowNull: true },
  invalidatedAt: { type: DataTypes.DATE, allowNull: true },
  requestedIp: { type: DataTypes.INET, allowNull: true },
}, {
  tableName: 'password_reset_tokens',
  underscored: true,
  updatedAt: false,
});
