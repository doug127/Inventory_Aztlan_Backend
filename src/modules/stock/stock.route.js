import { Router } from 'express';
import { auth } from '#src/shared/middlewares/auth.middleware.js';
import { validate } from '#src/shared/middlewares/validate.middleware.js';
import { AvailabilityQuerySchema, ListStockQuerySchema } from './stock.schema.js';
import { getAvailabilityController, listStockController } from './stock.controller.js';

const router = Router();

// Consultar stock: todos los roles (business_rules.md §8.2). GET / es la consulta de existencias por
// almacén y categoría con alertas (HU-407); /availability, la que usan los formularios de movimientos.
router.use(auth);
router.get('/', validate({ query: ListStockQuerySchema }), listStockController);
router.get('/availability', validate(AvailabilityQuerySchema, 'query'), getAvailabilityController);

export default router;
