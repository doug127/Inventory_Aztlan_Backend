import { DataTypes } from 'sequelize';
import { sequelize } from '#src/config/database.js';

// Tabla refresh_tokens (db_schema.md §2). Solo se guarda el SHA-256 del token; el token en claro
// lo tiene únicamente el cliente, en su cookie. Nota: pg devuelve BIGINT como string.
export const RefreshToken = sequelize.define('RefreshToken', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  userId: { type: DataTypes.INTEGER, allowNull: false },
  tokenHash: { type: DataTypes.STRING(255), allowNull: false, unique: true },
  userAgent: { type: DataTypes.STRING(255), allowNull: true },
  ipAddress: { type: DataTypes.INET, allowNull: true },
  expiresAt: { type: DataTypes.DATE, allowNull: false },
  revokedAt: { type: DataTypes.DATE, allowNull: true },
  replacedByTokenId: { type: DataTypes.BIGINT, allowNull: true },
}, {
  tableName: 'refresh_tokens',
  underscored: true,
  updatedAt: false,
});
