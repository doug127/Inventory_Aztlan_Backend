import * as categoryService from './product_category.service.js';
import { addLogContext, sendCreated, sendOk, sendPaginated } from '#src/shared/http/response.js';

// Sin try/catch: Express 5 lleva cualquier error de una función async al errorHandler.

export const listCategoriesController = async (req, res) => sendPaginated(res, await categoryService.listCategories(req.validated.query));

export const getCategoryTreeController = async (req, res) => {
  const tree = await categoryService.getCategoryTree(req.validated.query);
  addLogContext(res, { roots: tree.length });
  return sendOk(res, tree);
};

export const getCategoryController = async (req, res) => sendOk(res, await categoryService.getCategory(req.validated.params.id));

export const createCategoryController = async (req, res) => {
  const category = await categoryService.createCategory(req.validated.body);
  addLogContext(res, { created: category.code });
  return sendCreated(res, category);
};

export const updateCategoryController = async (req, res) => {
  addLogContext(res, { target: req.validated.params.id, fields: Object.keys(req.validated.body).join(',') });
  return sendOk(res, await categoryService.updateCategory(req.validated.params.id, req.validated.body));
};

export const deactivateCategoryController = async (req, res) => {
  const category = await categoryService.deactivateCategory(req.validated.params.id);
  addLogContext(res, { target: category.code });
  return sendOk(res, category);
};

export const activateCategoryController = async (req, res) => {
  const category = await categoryService.activateCategory(req.validated.params.id);
  addLogContext(res, { target: category.code });
  return sendOk(res, category);
};
