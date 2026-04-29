import Router from 'express';
import { auth } from '#src/shared/middlewares/auth.middleware.js';
import { authorizeRole } from '#src/shared/middlewares/authorize.middleware.js';
import { 
    fetchAllWarehousesControllers,
    fetchWarehouseByNameController,
    createWarehouseController,
    updateWarehouseController,
    deleteWarehouseController
} from './warehouse.controller.js';
import { ROLE_NAMES } from '#src/shared/constants/ROLE_NAMES.js';

const router = Router();

router.get('/', auth, authorizeRole(ROLE_NAMES.USER), fetchAllWarehousesControllers);
router.get('/:name', auth, authorizeRole(ROLE_NAMES.USER), fetchWarehouseByNameController);
router.post('/create', auth, authorizeRole(ROLE_NAMES.ADMIN), createWarehouseController);
router.put('/update/:id', auth, authorizeRole(ROLE_NAMES.ADMIN), updateWarehouseController);
router.delete('/destroy/:id', auth, authorizeRole(ROLE_NAMES.SUPERADMIN), deleteWarehouseController);

export default router;