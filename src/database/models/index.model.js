import sequelize from '#src/config/config.cjs';
import {User} from './User.js';
import {Role} from './Role.js';
import {ProductCategory} from './ProductCategory.js';
import {Unit} from './Unit.js';
import {Product} from './Product.js';
import {Warehouse} from './Warehouse.js';
import {Stock} from './Stock.js';
import {MovementHeader} from './MovementHeader.js';
import {MovementLine} from './MovementLine.js';
import {MovementDocument} from './MovementDocument.js';
import {AssetCategory} from './AssetCategory.js';
import {Asset} from './Asset.js';
import {AuthEvent} from './AuthEvent.js';
import {RefreshToken} from './RefreshToken.js';
import {EmailOutbox} from './EmailOutbox.js';
import {PasswordResetToken} from './PasswordResetToken.js';

// * Seguridad y autenticación (esquema nuevo, atributos camelCase)
Role.hasMany(User, { foreignKey: 'roleId', as: 'users' });
User.belongsTo(Role, { foreignKey: 'roleId', as: 'role' });
User.hasMany(AuthEvent, { foreignKey: 'userId', as: 'authEvents' });
AuthEvent.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(RefreshToken, { foreignKey: 'userId', as: 'refreshTokens' });
RefreshToken.belongsTo(User, { foreignKey: 'userId', as: 'user' });
RefreshToken.belongsTo(RefreshToken, { foreignKey: 'replacedByTokenId', as: 'replacedBy' });
User.hasMany(EmailOutbox, { foreignKey: 'userId', as: 'emails' });
EmailOutbox.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(PasswordResetToken, { foreignKey: 'userId', as: 'passwordResetTokens' });
PasswordResetToken.belongsTo(User, { foreignKey: 'userId', as: 'user' });
EmailOutbox.belongsTo(PasswordResetToken, { foreignKey: 'passwordResetTokenId', as: 'passwordResetToken' });

// * Categorías de productos: árbol (padre / hijas) y sus productos.
ProductCategory.belongsTo(ProductCategory, { foreignKey: 'parentId', as: 'parent' });
ProductCategory.hasMany(ProductCategory, { foreignKey: 'parentId', as: 'children' });
ProductCategory.hasMany(Product, { foreignKey: 'productCategoryId', as: 'products' });
Product.belongsTo(ProductCategory, { foreignKey: 'productCategoryId', as: 'category' });

// Compatibilidad: los módulos de productos y stock anteriores (REF-S1) importan este nombre.
const CategoryProduct = ProductCategory;

// * Relación uno a muchos entre Unit y Product
Unit.hasMany(Product, { foreignKey: 'unitId', as: 'products' });
Product.belongsTo(Unit, { foreignKey: 'unitId', as: 'unit' });

// * Relación uno a muchos entre Unit y Unit (auto-relación para unidades base y derivadas)
Unit.belongsTo(Unit, { foreignKey: 'baseUnitId', as: 'baseUnit' });
Unit.hasMany(Unit, { foreignKey: 'baseUnitId', as: 'derivedUnits' });

// * Inventario: stock por producto y almacén, y movimientos (cabecera + líneas).
Product.hasMany(Stock, { foreignKey: 'productId', as: 'stock' });
Stock.belongsTo(Product, { foreignKey: 'productId', as: 'product' });
Warehouse.hasMany(Stock, { foreignKey: 'warehouseId', as: 'stock' });
Stock.belongsTo(Warehouse, { foreignKey: 'warehouseId', as: 'warehouse' });

MovementHeader.belongsTo(User, { foreignKey: 'createdByUserId', as: 'createdBy' });
MovementHeader.belongsTo(Warehouse, { foreignKey: 'warehouseFromId', as: 'fromWarehouse' });
MovementHeader.belongsTo(Warehouse, { foreignKey: 'warehouseToId', as: 'toWarehouse' });
MovementHeader.hasMany(MovementLine, { foreignKey: 'movementHeaderId', as: 'lines' });
MovementLine.belongsTo(MovementHeader, { foreignKey: 'movementHeaderId', as: 'header' });
MovementLine.belongsTo(Product, { foreignKey: 'productId', as: 'product' });
MovementLine.belongsTo(Asset, { foreignKey: 'assetId', as: 'asset' });
// Documentos de recepción de las entradas (factura, vale, recibo…) y quién adjuntó su archivo.
MovementHeader.hasMany(MovementDocument, { foreignKey: 'movementHeaderId', as: 'documents' });
MovementDocument.belongsTo(MovementHeader, { foreignKey: 'movementHeaderId', as: 'header' });
MovementDocument.belongsTo(User, { foreignKey: 'fileUploadedByUserId', as: 'fileUploadedBy' });

// * Categorías de activos: árbol (padre / hijas) y sus activos (solo en las hojas).
AssetCategory.belongsTo(AssetCategory, { foreignKey: 'parentId', as: 'parent' });
AssetCategory.hasMany(AssetCategory, { foreignKey: 'parentId', as: 'children' });
AssetCategory.hasMany(Asset, { foreignKey: 'assetCategoryId', as: 'assets' });
Asset.belongsTo(AssetCategory, { foreignKey: 'assetCategoryId', as: 'category' });

export {
  User,
  Role,
  ProductCategory,
  CategoryProduct,
  Product,
  Unit,
  Stock,
  Warehouse,
  MovementHeader,
  MovementLine,
  MovementDocument,
  AssetCategory,
  Asset,
  AuthEvent,
  RefreshToken,
  EmailOutbox,
  PasswordResetToken
};
