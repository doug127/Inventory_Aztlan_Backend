import { Router } from 'express';
import { auth } from '#src/shared/middlewares/auth.middleware.js';
import { validate } from '#src/shared/middlewares/validate.middleware.js';
import { ConsumptionReportQuerySchema } from './report.schema.js';
import { getConsumptionReportController } from './report.controller.js';

const router = Router();

// Ver y exportar reportes: todos los roles (business_rules.md §8.2).
router.use(auth);
router.get('/consumption', validate({ query: ConsumptionReportQuerySchema }), getConsumptionReportController);

export default router;
