import { Router } from 'express';
import { auth } from '#src/shared/middlewares/auth.middleware.js';
import { authorizeRole } from '#src/shared/middlewares/authorize.middleware.js';
import { validate } from '#src/shared/middlewares/validate.middleware.js';
import { ROLE_CODES } from '#src/shared/constants/roles.js';
import { CreateProductSchema, ListProductsQuerySchema, NextCodeQuerySchema, ProductIdParamsSchema, UpdateProductSchema } from './product.schema.js';
import {
  activateProductController,
  createProductController,
  deactivateProductController,
  getNextCodeController,
  getProductController,
  listProductsController,
  updateProductController,
} from './product.controller.js';

const router = Router();
const byId = { params: ProductIdParamsSchema };
const admin = authorizeRole(ROLE_CODES.ADMIN);

// HU-204. Consultar: todos los roles. Crear, editar y desactivar: ADMIN o superior.
// No hay borrado: los productos se desactivan (business_rules.md P8).
router.use(auth);

router.get('/', validate(ListProductsQuerySchema, 'query'), listProductsController);
// Antes de /:id para que "next-code" no se lea como id. Solo lo usa el formulario de alta.
router.get('/next-code', admin, validate(NextCodeQuerySchema, 'query'), getNextCodeController);
router.get('/:id', validate(byId), getProductController);
router.post('/', admin, validate(CreateProductSchema), createProductController);
router.patch('/:id', admin, validate({ ...byId, body: UpdateProductSchema }), updateProductController);
router.post('/:id/deactivate', admin, validate(byId), deactivateProductController);
router.post('/:id/activate', admin, validate(byId), activateProductController);

export default router;
