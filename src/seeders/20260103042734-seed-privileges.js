import { level_hierarchy as lh } from '../utils/level_hierarchy.js';

export const up = async (queryInterface, Sequelize) => {
  await queryInterface.bulkInsert('privileges', [
    // * Privileges for User / Security Management
    { name: 'users.create', hierarchy: lh.ADMIN, description: 'Crear Usuarios', createdAt: new Date(), updatedAt: new Date() },
    { name: 'users.read', hierarchy: lh.USER, description: 'Leer Usuarios', createdAt: new Date(), updatedAt: new Date() },
    { name: 'users.update', hierarchy: lh.ADMIN, description: 'Actualizar Usuarios', createdAt: new Date(), updatedAt: new Date() },
    { name: 'users.delete', hierarchy: lh.SUPERADMIN, description: 'Eliminar Usuarios', createdAt: new Date(), updatedAt: new Date() },
    { name: 'roles.create', hierarchy: lh.SUPERADMIN, description: 'Crear Roles', createdAt: new Date(), updatedAt: new Date() },
    { name: 'roles.read', hierarchy: lh.ADMIN, description: 'Leer Roles', createdAt: new Date(), updatedAt: new Date() },
    { name: 'roles.update', hierarchy: lh.ADMIN, description: 'Actualizar Roles', createdAt: new Date(), updatedAt: new Date() },
    { name: 'roles.delete', hierarchy: lh.SUPERADMIN, description: 'Eliminar Roles', createdAt: new Date(), updatedAt: new Date() },

    // TODO: Los privilegios de abajo se irán agregando y adaptando conforme el proyecto vaya avanzando
    
    // * Warehouses Management Privileges
    { name: 'warehouses.create', hierarchy: lh.ADMIN, description: 'Crear Almacenes', createdAt: new Date(), updatedAt: new Date() },
    { name: 'warehouses.read', hierarchy: lh.USER, description: 'Leer Almacenes', createdAt: new Date(), updatedAt: new Date() },
    { name: 'warehouses.update', hierarchy: lh.ADMIN, description: 'Actualizar Almacenes', createdAt: new Date(), updatedAt: new Date() },
    { name: 'warehouses.delete', hierarchy: lh.SUPERADMIN, description: 'Eliminar Almacenes', createdAt: new Date(), updatedAt: new Date() },
    
    // * Products Management Privileges 
    { name: 'category_products.create', hierarchy: lh.ADMIN, description: 'Crear Categorías', createdAt: new Date(), updatedAt: new Date() },
    { name: 'category_products.read', hierarchy: lh.USER, description: 'Leer Categorías', createdAt: new Date(), updatedAt: new Date() },
    { name: 'category_products.update', hierarchy: lh.ADMIN, description: 'Actualizar Categorías', createdAt: new Date(), updatedAt: new Date() },
    { name: 'category_products.delete', hierarchy: lh.SUPERADMIN, description: 'Eliminar Categorías', createdAt: new Date(), updatedAt: new Date() },
    { name: 'units.create', hierarchy: lh.ADMIN, description: 'Crear Unidades', createdAt: new Date(), updatedAt: new Date() },
    { name: 'units.read', hierarchy: lh.USER, description: 'Leer Unidades', createdAt: new Date(), updatedAt: new Date() },
    { name: 'units.update', hierarchy: lh.ADMIN, description: 'Actualizar Unidades', createdAt: new Date(), updatedAt: new Date() },
    { name: 'units.delete', hierarchy: lh.SUPERADMIN, description: 'Eliminar Unidades', createdAt: new Date(), updatedAt: new Date() },
    { name: 'products.create', hierarchy: lh.ADMIN, description: 'Crear Productos', createdAt: new Date(), updatedAt: new Date() },
    { name: 'products.read', hierarchy: lh.USER, description: 'Leer Productos', createdAt: new Date(), updatedAt: new Date() },
    { name: 'products.update', hierarchy: lh.ADMIN, description: 'Actualizar Productos', createdAt: new Date(), updatedAt: new Date() },
    { name: 'products.delete', hierarchy: lh.SUPERADMIN, description: 'Eliminar Productos', createdAt: new Date(), updatedAt: new Date() },

    // * Inventory / Stock Management Privileges
    { name: 'stock.read', hierarchy: lh.USER, description: 'Leer Inventario', createdAt: new Date(), updatedAt: new Date() },
    { name: 'stock.adjust', hierarchy:lh.ADMIN, description: 'Ajustar Inventario', createdAt: new Date(), updatedAt: new Date() },
    
    // * Movements / Transactions Privileges
    { name: 'movements.read', hierarchy:lh.ADMIN, description: 'Leer Movimientos', createdAt: new Date(), updatedAt: new Date() },
    { name: 'movements.modify', hierarchy:lh.SUPERADMIN, description: 'Ajustar Movimientos', createdAt: new Date(), updatedAt: new Date() },
    { name: 'movements.modify_reasons', hierarchy: lh.SUPERADMIN, description: 'Modificar Razones', createdAt: new Date(), updatedAt: new Date()},
    
    // * Assets
    { name: 'asset_type.modify', hierarchy: lh.ADMIN, description: 'Modificar Tipos de activos', createdAt: new Date(), updatedAt: new Date()},
    { name: 'asset.modify', hierarchy: lh.ADMIN, description: 'Modificar activos', createdAt: new Date(), updatedAt: new Date()},

    // // * Reports Privileges
    // { name: 'reports.inventory', description: 'Generar Reportes de Inventario', createdAt: new Date(), updatedAt: new Date() },
    // { name: 'reports.movements', description: 'Generar Reportes de Movimientos', createdAt: new Date(), updatedAt: new Date() },
    // { name: 'reports.audit', description: 'Generar Reportes de Auditoría', createdAt: new Date(), updatedAt: new Date() },

    // // * Settings Privileges
    // { name: 'settings.manage', description: 'Administrar Configuraciones', createdAt: new Date(), updatedAt: new Date() },
    // { name: 'settings.audit_log.read', description: 'Leer Registro de Auditoría de Configuraciones', createdAt: new Date(), updatedAt: new Date() }
  
  ]
  , {});
};

export const down = async (queryInterface, Sequelize) => {
  await queryInterface.bulkDelete('privileges', null, {});
}