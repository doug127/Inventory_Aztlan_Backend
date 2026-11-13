import { DataTypes } from 'sequelize';
import { sequelize } from '#src/config/database.js';
import { EMAIL_STATUS, EMAIL_TEMPLATES } from '#src/shared/constants/email.js';

// Cola de correos (db_schema.md §2). No guarda el cuerpo del correo. Nota: pg devuelve BIGINT como string.
export const EmailOutbox = sequelize.define('EmailOutbox', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  userId: { type: DataTypes.INTEGER, allowNull: true },
  toEmail: { type: DataTypes.STRING(150), allowNull: false },
  template: { type: DataTypes.ENUM(...Object.values(EMAIL_TEMPLATES)), allowNull: false },
  subject: { type: DataTypes.STRING(200), allowNull: false },
  status: { type: DataTypes.ENUM(...Object.values(EMAIL_STATUS)), allowNull: false, defaultValue: EMAIL_STATUS.PENDING },
  attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  lastError: { type: DataTypes.TEXT, allowNull: true },
  providerMessageId: { type: DataTypes.STRING(255), allowNull: true },
  passwordResetTokenId: { type: DataTypes.BIGINT, allowNull: true },
  scheduledAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  sentAt: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'email_outbox',
  underscored: true,
  updatedAt: false,
});
