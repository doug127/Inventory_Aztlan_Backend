import { Router } from 'express';
import { auth } from '#src/shared/middlewares/auth.middleware.js';
import { authorizeRole } from '#src/shared/middlewares/authorize.middleware.js';
import { validate } from '#src/shared/middlewares/validate.middleware.js';
import { ROLE_CODES } from '#src/shared/constants/roles.js';
import {
  AssetCategoryIdParamsSchema,
  AssetCategoryTreeQuerySchema,
  CreateAssetCategorySchema,
  ListAssetCategoriesQuerySchema,
  UpdateAssetCategorySchema,
} from './asset_category.schema.js';
import {
  activateCategoryController,
  createCategoryController,
  deactivateCategoryController,
  getCategoryController,
  getCategoryTreeController,
  listCategoriesController,
  updateCategoryController,
} from './asset_category.controller.js';

const router = Router();
const byId = { params: AssetCategoryIdParamsSchema };
const admin = authorizeRole(ROLE_CODES.ADMIN);

// HU-301. Consultar: todos los roles. Crear, editar, mover (PATCH parentId) y desactivar: ADMIN o
// superior. No hay borrado: las categorías se desactivan (business_rules.md P8).
router.use(auth);

router.get('/', validate(ListAssetCategoriesQuerySchema, 'query'), listCategoriesController);
// Antes de /:id para que "tree" no se lea como id.
router.get('/tree', validate(AssetCategoryTreeQuerySchema, 'query'), getCategoryTreeController);
router.get('/:id', validate(byId), getCategoryController);
router.post('/', admin, validate(CreateAssetCategorySchema), createCategoryController);
router.patch('/:id', admin, validate({ ...byId, body: UpdateAssetCategorySchema }), updateCategoryController);
router.post('/:id/deactivate', admin, validate(byId), deactivateCategoryController);
router.post('/:id/activate', admin, validate(byId), activateCategoryController);

export default router;
