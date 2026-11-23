import * as assetService from './asset.service.js';
import { addLogContext, sendCreated, sendOk, sendPaginated } from '#src/shared/http/response.js';

// Sin try/catch: Express 5 lleva cualquier error de una función async al errorHandler.

export const listAssetsController = async (req, res) => sendPaginated(res, await assetService.listAssets(req.validated.query));

export const listAssetGroupsController = async (req, res) => sendPaginated(res, await assetService.listAssetGroups(req.validated.query));

export const getNextCodeController = async (req, res) => sendOk(res, await assetService.getNextCode(req.validated.query));

export const getAssetController = async (req, res) => sendOk(res, await assetService.getAsset(req.validated.params.id));

export const createAssetController = async (req, res) => {
  const asset = await assetService.createAsset(req.validated.body);
  addLogContext(res, { created: asset.code });
  return sendCreated(res, asset);
};

export const updateAssetController = async (req, res) => {
  addLogContext(res, { target: req.validated.params.id, fields: Object.keys(req.validated.body).join(',') });
  return sendOk(res, await assetService.updateAsset(req.validated.params.id, req.validated.body));
};

export const deactivateAssetController = async (req, res) => {
  const asset = await assetService.deactivateAsset(req.validated.params.id);
  addLogContext(res, { target: asset.code });
  return sendOk(res, asset);
};

export const activateAssetController = async (req, res) => {
  const asset = await assetService.activateAsset(req.validated.params.id);
  addLogContext(res, { target: asset.code });
  return sendOk(res, asset);
};

export const getAssetConsumptionController = async (req, res) => {
  const sheet = await assetService.getAssetConsumption(req.validated.params.id, req.validated.query);
  addLogContext(res, { target: sheet.asset.code, products: sheet.consumption.length });
  return sendOk(res, sheet);
};

export const listAssetHistoryController = async (req, res) =>
  sendPaginated(res, await assetService.listAssetHistory(req.validated.params.id, req.validated.query));
