import { Router } from 'express';
import { auth } from '#src/shared/middlewares/auth.middleware.js';
import { validate } from '#src/shared/middlewares/validate.middleware.js';
import { ListStockQuerySchema, KardexQuerySchema } from '#src/modules/stock/stock.schema.js';
import { ListMovementsQuerySchema } from '#src/modules/movement/movement.schema.js';
import { ConsumptionReportQuerySchema, MovementsReportQuerySchema } from './report.schema.js';
import { exportController, getConsumptionReportController, getMovementsReportController } from './report.controller.js';
import { exportConsumption, exportHistory, exportKardex, exportMovementsReport, exportStock } from './report.export.js';

const router = Router();

// Ver y exportar reportes: todos los roles (business_rules.md §8.2).
router.use(auth);
router.get('/consumption', validate({ query: ConsumptionReportQuerySchema }), getConsumptionReportController);
router.get('/movements', validate({ query: MovementsReportQuerySchema }), getMovementsReportController);

// Exportación a Excel (HU-503): mismos filtros que la pantalla de cada reporte; page y limit se ignoran.
router.get('/stock/export', validate({ query: ListStockQuerySchema }), exportController(exportStock));
router.get('/kardex/export', validate({ query: KardexQuerySchema }), exportController(exportKardex));
router.get('/history/export', validate({ query: ListMovementsQuerySchema }), exportController(exportHistory));
router.get('/consumption/export', validate({ query: ConsumptionReportQuerySchema }), exportController(exportConsumption));
router.get('/movements/export', validate({ query: MovementsReportQuerySchema }), exportController(exportMovementsReport));

export default router;
