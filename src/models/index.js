import sequelize from '../config/config.cjs';
import {User} from './User.js';
import {Role} from './Role.js';
import {CategoryProduct} from './CategoryProduct.js';
import {Unit} from './Unit.js';
import {Product} from './Product.js';
import {Warehouse} from './Warehouse.js';
import {Stock} from './Stock.js';
import {MovementType} from './MovementType.js';
import {Reason} from './Reason.js';
import {MovementHeader} from './MovementHeader.js';
import {MovementLine} from './MovementLine.js';
import {AssetType} from './AssetType.js';
import {Asset} from './Asset.js';
import {MovementTarget} from './MovementTarget.js';

// * Relación uno a muchos entre Role y User
Role.hasMany(User, { foreignKey: 'id' });
User.belongsTo(Role, { foreignKey: 'role_id' });

// * Relación uno a muchos entre CategoryProduct y Product
CategoryProduct.hasMany(Product, { foreignKey: 'product_category_id' });
Product.belongsTo(CategoryProduct, { foreignKey: 'product_category_id' });

// * Relación uno a muchos entre Unit y Product
Unit.hasMany(Product, { foreignKey: 'unit_id' });
Product.belongsTo(Unit, { foreignKey: 'unit_id' });

// * Relación uno a muchos entre Product y Stock
Product.hasMany(Stock, { foreignKey: 'product_id' });
Stock.belongsTo(Product, { foreignKey: 'product_id' });

// * Relación uno a muchos entre Warehouse y Stock
Warehouse.hasMany(Stock, { foreignKey: 'warehouse_id' });
Stock.belongsTo(Warehouse, { foreignKey: 'warehouse_id' });

// * Relación uno a muchos entre MovementType y MovementHeader
MovementType.hasMany(MovementHeader, {foreignKey: 'movement_type_id'});
MovementHeader.belongsTo(MovementType, {foreignKey: 'movement_type_id'});

// * Relación uno a muchos entre Reason y MovementHeader
Reason.hasMany(MovementHeader, {foreignKey: 'reason_id'});
MovementHeader.belongsTo(Reason, {foreignKey: 'reason_id'});

// * Relación uno a muchos entre User y MovementHeader
User.hasMany(MovementHeader, { foreignKey: 'created_by_user_id' });
MovementHeader.belongsTo(User, { foreignKey: 'created_by_user_id' });

// * Relación uno a muchos entre Warehouse y MovementHeader (warehouse_from_id)
Warehouse.hasMany(MovementHeader, { foreignKey: 'warehouse_from_id' });
MovementHeader.belongsTo(Warehouse, { foreignKey: 'warehouse_from_id', as: 'warehouse_from' });

// * Relación uno a muchos entre Warehouse y MovementHeader (warehouse_to_id)
Warehouse.hasMany(MovementHeader, { foreignKey: 'warehouse_to_id' });
MovementHeader.belongsTo(Warehouse, { foreignKey: 'warehouse_to_id', as: 'warehouse_to' });

// * Relación uno a muchos entre MovementHeader y MovementLine
MovementHeader.hasMany(MovementLine, { foreignKey: 'movement_header_id' });
MovementLine.belongsTo(MovementHeader, { foreignKey: 'movement_header_id' });

// * Relación uno a muchos entre Product y MovementLine
Product.hasMany(MovementLine, { foreignKey: 'product_id' });
MovementLine.belongsTo(Product, { foreignKey: 'product_id' });

// * Relación uno a muchos entre AssetType y Asset
AssetType.hasMany(Asset, { foreignKey: 'asset_type_id' });
Asset.belongsTo(AssetType, { foreignKey: 'asset_type_id' });

// * Relación uno a muchos entre MovementHeader y MovementTarget
MovementHeader.hasMany(MovementTarget, {foreignKey: 'movement_header_id'});
MovementTarget.belongsTo(MovementHeader, {foreignKey: 'movement_header_id'});

// * Relación uno a muchos entre Asset y MovementTarget
Asset.hasMany(MovementTarget, {foreignKey: 'asset_id'});
MovementTarget.belongsTo(Asset, {foreignKey: 'asset_id'});

export {
  User,
  Role,
  CategoryProduct,
  Product,
  Unit,
  Stock,
  Warehouse,
  MovementType,
  Reason,
  MovementHeader,
  MovementLine,
  AssetType,
  Asset,
  MovementTarget
};
