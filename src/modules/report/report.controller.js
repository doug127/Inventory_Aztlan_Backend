import * as reportService from './report.service.js';
import { addLogContext, sendFile, sendPaginated } from '#src/shared/http/response.js';

// Sin try/catch: Express 5 lleva cualquier error de una función async al errorHandler.

/** Reporte de consumo por activo o por categoría de activo (HU-501). Todos los roles. */
export const getConsumptionReportController = async (req, res) => {
  const report = await reportService.getConsumptionReport(req.validated.query);
  addLogContext(res, { groupBy: report.filters.groupBy });
  return sendPaginated(res, report);
};

/** Reporte de movimientos por período (HU-502). Todos los roles. */
export const getMovementsReportController = async (req, res) => {
  const report = await reportService.getMovementsReport(req.validated.query);
  addLogContext(res, { interval: report.filters.interval });
  return sendPaginated(res, report);
};

/**
 * Exportación a Excel (HU-503): el mismo reporte, con todas sus filas, como archivo .xlsx descargable.
 * Todos los roles. exporter es una función de report.export.js.
 */
export const exportController = (exporter) => async (req, res) => {
  const file = await exporter(req.validated.query, { actor: req.user });
  addLogContext(res, { exported: file.name, bytes: file.buffer.length });
  return sendFile(res, { ...file, disposition: 'attachment' });
};
