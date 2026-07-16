import Router from 'express';
import authRoutes from '#src/modules/auth/auth.route.js';
import userRoutes from '#src/modules/user/user.route.js';
import warehouseRoutes from '#src/modules/warehouse/warehouse.route.js';
import category_products from '#src/modules/product/category_product/category_product.route.js';
import unitRoutes from '#src/modules/product/unit/unit.route.js';
import productRoutes from '#src/modules/product/product.route.js';
import stockRoutes from '#src/modules/stock/stock.route.js';
import movementTypes from '#src/modules/movement/movement_type/movement_type.route.js';
import reasonRoutes from '#src/modules/movement/reason/reason.route.js';
import movementRoutes from '#src/modules/movement/movement.route.js';
import assetTypeRouter from '#src/modules/asset/asset_type/asset_type.route.js';
import assetRouter from '#src/modules/asset/asset.route.js';

const routes = Router();

routes.use('/auth', authRoutes);
routes.use('/users', userRoutes);
routes.use('/movements', movementRoutes);
routes.use('/warehouses', warehouseRoutes);
routes.use('/categories', category_products);
routes.use('/units', unitRoutes);
routes.use('/products', productRoutes);
routes.use('/stock', stockRoutes);
routes.use('/movement-types', movementTypes);
routes.use('/reasons', reasonRoutes);
routes.use('/asset-types', assetTypeRouter);
routes.use('/assets', assetRouter);

export default routes;