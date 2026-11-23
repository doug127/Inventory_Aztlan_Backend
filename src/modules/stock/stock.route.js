import { Router } from 'express';
import { auth } from '#src/shared/middlewares/auth.middleware.js';
import { validate } from '#src/shared/middlewares/validate.middleware.js';
import { AvailabilityQuerySchema } from './stock.schema.js';
import { getAvailabilityController } from './stock.controller.js';

const router = Router();

// Consultar stock: todos los roles (business_rules.md §8.2). La consulta por almacén y categoría
// con alertas llega en HU-407.
router.use(auth);
router.get('/availability', validate(AvailabilityQuerySchema, 'query'), getAvailabilityController);

export default router;
