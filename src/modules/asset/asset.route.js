import { Router } from 'express';
import { auth } from '#src/shared/middlewares/auth.middleware.js';
import { authorizeRole } from '#src/shared/middlewares/authorize.middleware.js';
import { validate } from '#src/shared/middlewares/validate.middleware.js';
import { ROLE_CODES } from '#src/shared/constants/roles.js';
import {
  AssetConsumptionQuerySchema,
  AssetHistoryQuerySchema,
  AssetIdParamsSchema,
  CreateAssetSchema,
  ListAssetGroupsQuerySchema,
  ListAssetsQuerySchema,
  NextAssetCodeQuerySchema,
  UpdateAssetSchema,
} from './asset.schema.js';
import {
  activateAssetController,
  createAssetController,
  deactivateAssetController,
  getAssetConsumptionController,
  getAssetController,
  getNextCodeController,
  listAssetsController,
  listAssetGroupsController,
  listAssetHistoryController,
  updateAssetController,
} from './asset.controller.js';

const router = Router();
const byId = { params: AssetIdParamsSchema };
const admin = authorizeRole(ROLE_CODES.ADMIN);

// HU-302. Consultar: todos los roles. Crear, editar y desactivar: ADMIN o superior.
// No hay borrado: los activos se desactivan y conservan su historial (business_rules.md P8, §6.5).
router.use(auth);

router.get('/', validate(ListAssetsQuerySchema, 'query'), listAssetsController);
// Antes de /:id. Agrupa por categoría hoja (lotes con sus tablones) para las ramas con muchos activos.
router.get('/groups', validate(ListAssetGroupsQuerySchema, 'query'), listAssetGroupsController);
// Antes de /:id para que "next-code" no se lea como id. Solo lo usa el formulario de alta.
router.get('/next-code', admin, validate(NextAssetCodeQuerySchema, 'query'), getNextCodeController);
router.get('/:id', validate(byId), getAssetController);
// HU-304: ficha del activo. Consumo neto por producto en el período e historial de sus movimientos.
router.get('/:id/consumption', validate({ ...byId, query: AssetConsumptionQuerySchema }), getAssetConsumptionController);
router.get('/:id/history', validate({ ...byId, query: AssetHistoryQuerySchema }), listAssetHistoryController);
router.post('/', admin, validate(CreateAssetSchema), createAssetController);
router.patch('/:id', admin, validate({ ...byId, body: UpdateAssetSchema }), updateAssetController);
router.post('/:id/deactivate', admin, validate(byId), deactivateAssetController);
router.post('/:id/activate', admin, validate(byId), activateAssetController);

export default router;
