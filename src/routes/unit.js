import Router from 'express';
import { auth } from '../middlewares/auth.js';
import { authorizePrivilege, authorizeHierarchy } from '../middlewares/authorize.js';
import {
    level_hierarchy as lh
} from '../utils/level_hierarchy.js';
import {
    getAllUnitsController,
    getUnitByIdController,
    createUnitController,
    updateUnitController,
    deleteUnitController    
} from '../controllers/unit.js';

const router = Router();

router.get('/', auth, authorizePrivilege('units.read'), getAllUnitsController);
router.get('/:id', auth, authorizePrivilege('units.read'), getUnitByIdController);
router.post('/create', auth, authorizePrivilege('units.create'), authorizeHierarchy(lh.ADMIN), createUnitController);
router.put('/update/:id', auth, authorizePrivilege('units.update'), authorizeHierarchy(lh.ADMIN), updateUnitController);
router.delete('/destroy/:id', auth, authorizePrivilege('units.delete'), authorizeHierarchy(lh.SUPERADMIN), deleteUnitController);

export default router;