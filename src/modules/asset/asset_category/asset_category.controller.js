import * as assetCategoryService from './asset_category.service.js';
import { addLogContext, sendCreated, sendOk, sendPaginated } from '#src/shared/http/response.js';

// Sin try/catch: Express 5 lleva cualquier error de una función async al errorHandler.

export const listCategoriesController = async (req, res) => sendPaginated(res, await assetCategoryService.listCategories(req.validated.query));

export const getCategoryTreeController = async (req, res) => {
  const tree = await assetCategoryService.getCategoryTree(req.validated.query);
  addLogContext(res, { roots: tree.length });
  return sendOk(res, tree);
};

export const countAssetsController = async (req, res) => {
  const result = await assetCategoryService.countAssets(req.validated.query);
  addLogContext(res, { category: result.category?.code ?? 'ALL', assets: result.assets.total });
  return sendOk(res, result);
};

export const getCategoryController =async (req, res) => sendOk(res, await assetCategoryService.getCategory(req.validated.params.id));

export const createCategoryController = async (req, res) => {
  const category = await assetCategoryService.createCategory(req.validated.body);
  addLogContext(res, { created: category.code });
  return sendCreated(res, category);
};

export const updateCategoryController = async (req, res) => {
  addLogContext(res, { target: req.validated.params.id, fields: Object.keys(req.validated.body).join(',') });
  return sendOk(res, await assetCategoryService.updateCategory(req.validated.params.id, req.validated.body));
};

export const deactivateCategoryController = async (req, res) => {
  const category = await assetCategoryService.deactivateCategory(req.validated.params.id);
  addLogContext(res, { target: category.code });
  return sendOk(res, category);
};

export const activateCategoryController = async (req, res) => {
  const category = await assetCategoryService.activateCategory(req.validated.params.id);
  addLogContext(res, { target: category.code });
  return sendOk(res, category);
};
