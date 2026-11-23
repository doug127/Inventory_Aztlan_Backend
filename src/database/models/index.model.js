import sequelize from '#src/config/config.cjs';
import {User} from './User.js';
import {Role} from './Role.js';
import {ProductCategory} from './ProductCategory.js';
import {Unit} from './Unit.js';
import {Product} from './Product.js';
import {Warehouse} from './Warehouse.js';
import {Stock} from './Stock.js';
import {MovementType} from './MovementType.js';
import {Reason} from './Reason.js';
import {MovementHeader} from './MovementHeader.js';
import {MovementLine} from './MovementLine.js';
import {AssetCategory} from './AssetCategory.js';
import {AssetType} from './AssetType.js';
import {Asset} from './Asset.js';
import {MovementTarget} from './MovementTarget.js';
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

// * Relación uno a muchos entre Product y Stock
Product.hasMany(Stock, { foreignKey: 'product_id' });
Stock.belongsTo(Product, { foreignKey: 'product_id' });

// * Relación uno a muchos entre Warehouse y Stock
Warehouse.hasMany(Stock, { foreignKey: 'warehouse_id' });
Stock.belongsTo(Warehouse, { foreignKey: 'warehouse_id' });

// * Relación uno a muchos entre MovementType y MovementHeader
MovementType.hasMany(MovementHeader, { foreignKey: 'movement_type_id' });
MovementHeader.belongsTo(MovementType, { 
    foreignKey: 'movement_type_id',
    as: 'movement_type'
});

// * Relación uno a muchos entre Reason y MovementHeader
Reason.hasMany(MovementHeader, { foreignKey: 'reason_id' });
MovementHeader.belongsTo(Reason, { 
    foreignKey: 'reason_id',
    as: 'reason'
});

// * Relación uno a muchos entre User y MovementHeader
User.hasMany(MovementHeader, { foreignKey: 'created_by_user_id' });
MovementHeader.belongsTo(User, { 
    foreignKey: 'created_by_user_id',
    as: 'user'
});

// * Relación uno a muchos entre Warehouse y MovementHeader (warehouse_from_id)
Warehouse.hasMany(MovementHeader, { foreignKey: 'warehouse_from_id' });
MovementHeader.belongsTo(Warehouse, { foreignKey: 'warehouse_from_id', as: 'warehouse_from' });

// * Relación uno a muchos entre Warehouse y MovementHeader (warehouse_to_id)
Warehouse.hasMany(MovementHeader, { foreignKey: 'warehouse_to_id' });
MovementHeader.belongsTo(Warehouse, { foreignKey: 'warehouse_to_id', as: 'warehouse_to' });

// * Relación uno a muchos entre MovementHeader y MovementLine
MovementHeader.hasMany(MovementLine, { 
    foreignKey: 'movement_header_id',
    as: 'movement_lines'
});
MovementLine.belongsTo(MovementHeader, { foreignKey: 'movement_header_id' });

// * Relación uno a muchos entre Product y MovementLine
Product.hasMany(MovementLine, { foreignKey: 'product_id' });
MovementLine.belongsTo(Product, { 
    foreignKey: 'product_id',
    as: 'product'
});

// * Categorías de activos: árbol (padre / hijas) y sus activos (solo en las hojas).
AssetCategory.belongsTo(AssetCategory, { foreignKey: 'parentId', as: 'parent' });
AssetCategory.hasMany(AssetCategory, { foreignKey: 'parentId', as: 'children' });
AssetCategory.hasMany(Asset, { foreignKey: 'assetCategoryId', as: 'assets' });
Asset.belongsTo(AssetCategory, { foreignKey: 'assetCategoryId', as: 'category' });

// AssetType y MovementTarget son del esquema anterior: los importa el módulo de movimientos
// heredado hasta que se reescriba en HU-401 (sus tablas ya no existen).
// * Relación uno a muchos entre MovementHeader y MovementTarget
MovementHeader.hasMany(MovementTarget, { 
    foreignKey: 'movement_header_id',
    as: 'movement_targets'
});
MovementTarget.belongsTo(MovementHeader, { foreignKey: 'movement_header_id' });

// * Relación uno a muchos entre Asset y MovementTarget
Asset.hasMany(MovementTarget, { foreignKey: 'asset_id' });
MovementTarget.belongsTo(Asset, { 
    foreignKey: 'asset_id',
    as: 'asset'
});

export {
  User,
  Role,
  ProductCategory,
  CategoryProduct,
  Product,
  Unit,
  Stock,
  Warehouse,
  MovementType,
  Reason,
  MovementHeader,
  MovementLine,
  AssetCategory,
  AssetType,
  Asset,
  MovementTarget,
  AuthEvent,
  RefreshToken,
  EmailOutbox,
  PasswordResetToken
};
