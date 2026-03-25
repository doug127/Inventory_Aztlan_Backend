import Router from 'express';
import { auth } from '../middlewares/auth.js';
import { authorizePrivilege, authorizeHierarchy } from '../middlewares/authorize.js';
import { 
    fetchAllWarehousesControllers,
    fetchWarehouseByNameController,
    createWarehouseController,
    updateWarehouseController,
    deleteWarehouseController
} from '../controllers/warehouse.js';
import { level_hierarchy as lh } from '../utils/level_hierarchy.js';

const router = Router();

router.get('/', auth, authorizePrivilege('warehouses.read'), fetchAllWarehousesControllers);
router.get('/:name', auth, authorizePrivilege('warehouses.read'), fetchWarehouseByNameController);
router.post('/create', auth, authorizePrivilege('warehouses.create'), authorizeHierarchy(lh.ADMIN), createWarehouseController);
router.put('/update/:id', auth, authorizePrivilege('warehouses.update'), authorizeHierarchy(lh.ADMIN), updateWarehouseController);
router.delete('/destroy/:id', auth, authorizePrivilege('warehouses.delete'), authorizeHierarchy(lh.SUPERADMIN), deleteWarehouseController);

export default router;