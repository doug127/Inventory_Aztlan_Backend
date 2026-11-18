import { Router } from 'express';
import { auth } from '#src/shared/middlewares/auth.middleware.js';
import { authorizeRole } from '#src/shared/middlewares/authorize.middleware.js';
import { validate } from '#src/shared/middlewares/validate.middleware.js';
import { ROLE_CODES } from '#src/shared/constants/roles.js';
import {
  CreateWarehouseSchema,
  ListWarehousesQuerySchema,
  UpdateWarehouseSchema,
  WarehouseIdParamsSchema,
} from './warehouse.schema.js';
import {
  activateWarehouseController,
  createWarehouseController,
  deactivateWarehouseController,
  getWarehouseController,
  listWarehousesController,
  updateWarehouseController,
} from './warehouse.controller.js';

const router = Router();
const byId = { params: WarehouseIdParamsSchema };
const admin = authorizeRole(ROLE_CODES.ADMIN);

// HU-201. Consultar: todos los roles. Crear, editar y desactivar: ADMIN o superior (business_rules.md §8.2).
// No hay borrado: los almacenes se desactivan (sus movimientos y existencias los referencian).
router.use(auth);

router.get('/', validate(ListWarehousesQuerySchema, 'query'), listWarehousesController);
router.get('/:id', validate(byId), getWarehouseController);
router.post('/', admin, validate(CreateWarehouseSchema), createWarehouseController);
router.patch('/:id', admin, validate({ ...byId, body: UpdateWarehouseSchema }), updateWarehouseController);
router.post('/:id/deactivate', admin, validate(byId), deactivateWarehouseController);
router.post('/:id/activate', admin, validate(byId), activateWarehouseController);

export default router;
