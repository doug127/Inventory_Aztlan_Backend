import Router from 'express';
import authRoutes from './auth.js';
import userRoutes from './user.js';
import warehouseRoutes from './warehouse.js';
import category_products from './category_products.js';
import unitRoutes from './unit.js';
import productRoutes from './product.js';
import stockRoutes from './stock.js';
import movementTypes from './movement_types.js';
import reasonRoutes from './reasons.js';
import movementRoutes from './movement.js';
import assetTypeRouter from './asset_types.js';
import assetRouter from './assets.js';

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