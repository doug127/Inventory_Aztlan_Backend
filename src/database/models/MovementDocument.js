import { DataTypes } from 'sequelize';
import { sequelize } from '#src/config/database.js';
import { RECEIPT_DOCUMENT_TYPES } from '#src/shared/constants/movements.js';

// Tabla movement_documents (db_schema.md §4): documentos de recepción de una entrada (factura, vale,
// recibo…) y, opcionalmente, su archivo. Inmutable salvo adjuntar el archivo una vez
// (trg_movement_documents_rules). NUMERIC(14,2) llega como texto; DATE como 'YYYY-MM-DD'.
export const MovementDocument = sequelize.define('MovementDocument', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  movementHeaderId: { type: DataTypes.INTEGER, allowNull: false },
  documentType: { type: DataTypes.STRING(20), allowNull: false, validate: { isIn: [Object.values(RECEIPT_DOCUMENT_TYPES)] } },
  documentNumber: { type: DataTypes.STRING(40), allowNull: false },
  supplierName: { type: DataTypes.STRING(150), allowNull: true },
  supplierTaxId: { type: DataTypes.STRING(20), allowNull: true },
  issueDate: { type: DataTypes.DATEONLY, allowNull: true },
  totalAmount: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
  currency: { type: DataTypes.CHAR(3), allowNull: true },
  fileStorageKey: { type: DataTypes.STRING(80), allowNull: true },
  fileOriginalName: { type: DataTypes.STRING(255), allowNull: true },
  fileMimeType: { type: DataTypes.STRING(50), allowNull: true },
  fileSizeBytes: { type: DataTypes.INTEGER, allowNull: true },
  fileSha256: { type: DataTypes.CHAR(64), allowNull: true },
  fileUploadedAt: { type: DataTypes.DATE, allowNull: true },
  fileUploadedByUserId: { type: DataTypes.INTEGER, allowNull: true },
}, {
  tableName: 'movement_documents',
  underscored: true,
  updatedAt: false,
});
