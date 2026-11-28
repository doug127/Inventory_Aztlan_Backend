import * as reportService from './report.service.js';
import { addLogContext, sendPaginated } from '#src/shared/http/response.js';

// Sin try/catch: Express 5 lleva cualquier error de una función async al errorHandler.

/** Reporte de consumo por activo o por categoría de activo (HU-501). Todos los roles. */
export const getConsumptionReportController = async (req, res) => {
  const report = await reportService.getConsumptionReport(req.validated.query);
  addLogContext(res, { groupBy: report.filters.groupBy });
  return sendPaginated(res, report);
};
