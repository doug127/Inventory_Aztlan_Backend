import Router from 'express';
import { auth } from '../middlewares/auth.js';
import { authorizeRole } from '../middlewares/authorize.js';
import { 
    fetchAllWarehousesControllers,
    fetchWarehouseByNameController,
    createWarehouseController,
    updateWarehouseController,
    deleteWarehouseController
} from '../controllers/warehouse.js';
import { ROLE_NAMES } from '../utils/ROLE_NAMES.js';

const router = Router();

router.get('/', auth, authorizeRole(ROLE_NAMES.USER), fetchAllWarehousesControllers);
router.get('/:name', auth, authorizeRole(ROLE_NAMES.USER), fetchWarehouseByNameController);
router.post('/create', auth, authorizeRole(ROLE_NAMES.ADMIN), createWarehouseController);
router.put('/update/:id', auth, authorizeRole(ROLE_NAMES.ADMIN), updateWarehouseController);
router.delete('/destroy/:id', auth, authorizeRole(ROLE_NAMES.SUPERADMIN), deleteWarehouseController);

export default router;