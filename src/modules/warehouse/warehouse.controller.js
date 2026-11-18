import * as warehouseService from './warehouse.service.js';
import { addLogContext, sendCreated, sendOk, sendPaginated } from '#src/shared/http/response.js';

// Sin try/catch: Express 5 lleva cualquier error de una función async al errorHandler.

export const listWarehousesController = async (req, res) =>
  sendPaginated(res, await warehouseService.listWarehouses(req.validated.query));

export const getWarehouseController = async (req, res) =>
  sendOk(res, await warehouseService.getWarehouse(req.validated.params.id));

export const createWarehouseController = async (req, res) => {
  const warehouse = await warehouseService.createWarehouse(req.validated.body);
  addLogContext(res, { created: warehouse.code });
  return sendCreated(res, warehouse);
};

export const updateWarehouseController = async (req, res) => {
  addLogContext(res, { target: req.validated.params.id, fields: Object.keys(req.validated.body).join(',') });
  return sendOk(res, await warehouseService.updateWarehouse(req.validated.params.id, req.validated.body));
};

export const deactivateWarehouseController = async (req, res) => {
  const warehouse = await warehouseService.deactivateWarehouse(req.validated.params.id);
  addLogContext(res, { target: warehouse.code });
  return sendOk(res, warehouse);
};

export const activateWarehouseController = async (req, res) => {
  const warehouse = await warehouseService.activateWarehouse(req.validated.params.id);
  addLogContext(res, { target: warehouse.code });
  return sendOk(res, warehouse);
};
