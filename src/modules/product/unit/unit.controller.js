import * as unitService from './unit.service.js';
import { addLogContext, sendCreated, sendOk, sendPaginated } from '#src/shared/http/response.js';

// Sin try/catch: Express 5 lleva cualquier error de una función async al errorHandler.

export const listUnitsController = async (req, res) => sendPaginated(res, await unitService.listUnits(req.validated.query));

export const getUnitController = async (req, res) => sendOk(res, await unitService.getUnit(req.validated.params.id));

export const convertController = async (req, res) => sendOk(res, await unitService.convert(req.validated.query));

export const createUnitController = async (req, res) => {
  const unit = await unitService.createUnit(req.validated.body);
  addLogContext(res, { created: unit.code });
  return sendCreated(res, unit);
};

export const updateUnitController = async (req, res) => {
  addLogContext(res, { target: req.validated.params.id, fields: Object.keys(req.validated.body).join(',') });
  return sendOk(res, await unitService.updateUnit(req.validated.params.id, req.validated.body));
};

export const deactivateUnitController = async (req, res) => {
  const unit = await unitService.deactivateUnit(req.validated.params.id);
  addLogContext(res, { target: unit.code });
  return sendOk(res, unit);
};

export const activateUnitController = async (req, res) => {
  const unit = await unitService.activateUnit(req.validated.params.id);
  addLogContext(res, { target: unit.code });
  return sendOk(res, unit);
};
