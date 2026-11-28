import * as stockService from './stock.service.js';
import { addLogContext, sendOk, sendPaginated } from '#src/shared/http/response.js';

// Sin try/catch: Express 5 lleva cualquier error de una función async al errorHandler.

/** Kardex de un producto (HU-409). Todos los roles. */
export const getKardexController = async (req, res) => sendPaginated(res, await stockService.getKardex(req.validated.query));

/** Existencias con alertas (HU-407). Todos los roles. */
export const listStockController = async (req, res) => sendPaginated(res, await stockService.listStock(req.validated.query));

export const getAvailabilityController = async (req, res) => {
  const result = await stockService.getAvailability(req.validated.query);
  addLogContext(res, { warehouse: result.warehouse.code, products: result.items.length });
  return sendOk(res, result);
};
