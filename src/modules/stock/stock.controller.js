import * as stockService from './stock.service.js';
import { addLogContext, sendOk } from '#src/shared/http/response.js';

// Sin try/catch: Express 5 lleva cualquier error de una función async al errorHandler.

export const getAvailabilityController = async (req, res) => {
  const result = await stockService.getAvailability(req.validated.query);
  addLogContext(res, { warehouse: result.warehouse.code, products: result.items.length });
  return sendOk(res, result);
};
