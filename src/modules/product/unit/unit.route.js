import { Router } from 'express';
import { auth } from '#src/shared/middlewares/auth.middleware.js';
import { authorizeRole } from '#src/shared/middlewares/authorize.middleware.js';
import { validate } from '#src/shared/middlewares/validate.middleware.js';
import { ROLE_CODES } from '#src/shared/constants/roles.js';
import { ConvertQuerySchema, CreateUnitSchema, ListUnitsQuerySchema, UnitIdParamsSchema, UpdateUnitSchema } from './unit.schema.js';
import {
  activateUnitController,
  convertController,
  createUnitController,
  deactivateUnitController,
  getUnitController,
  listUnitsController,
  updateUnitController,
} from './unit.controller.js';

const router = Router();
const byId = { params: UnitIdParamsSchema };
const admin = authorizeRole(ROLE_CODES.ADMIN);

// HU-202. Consultar y convertir: todos los roles. Crear, editar y desactivar: ADMIN o superior.
// No hay borrado: las unidades se desactivan (los productos las referencian).
router.use(auth);

router.get('/', validate(ListUnitsQuerySchema, 'query'), listUnitsController);
// Antes de /:id para que "convert" no se lea como id.
router.get('/convert', validate(ConvertQuerySchema, 'query'), convertController);
router.get('/:id', validate(byId), getUnitController);
router.post('/', admin, validate(CreateUnitSchema), createUnitController);
router.patch('/:id', admin, validate({ ...byId, body: UpdateUnitSchema }), updateUnitController);
router.post('/:id/deactivate', admin, validate(byId), deactivateUnitController);
router.post('/:id/activate', admin, validate(byId), activateUnitController);

export default router;
