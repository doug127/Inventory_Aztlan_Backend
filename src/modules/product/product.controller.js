import * as productService from './product.service.js';
import { addLogContext, sendCreated, sendOk, sendPaginated } from '#src/shared/http/response.js';

// Sin try/catch: Express 5 lleva cualquier error de una función async al errorHandler.

export const listProductsController = async (req, res) => sendPaginated(res, await productService.listProducts(req.validated.query));

export const getNextCodeController = async (req, res) => sendOk(res, await productService.getNextCode(req.validated.query));

export const getProductController = async (req, res) => sendOk(res, await productService.getProduct(req.validated.params.id));

export const createProductController = async (req, res) => {
  const product = await productService.createProduct(req.validated.body);
  addLogContext(res, { created: product.code });
  return sendCreated(res, product);
};

export const updateProductController = async (req, res) => {
  addLogContext(res, { target: req.validated.params.id, fields: Object.keys(req.validated.body).join(',') });
  return sendOk(res, await productService.updateProduct(req.validated.params.id, req.validated.body));
};

export const deactivateProductController = async (req, res) => {
  const product = await productService.deactivateProduct(req.validated.params.id);
  addLogContext(res, { target: product.code });
  return sendOk(res, product);
};

export const activateProductController = async (req, res) => {
  const product = await productService.activateProduct(req.validated.params.id);
  addLogContext(res, { target: product.code });
  return sendOk(res, product);
};
