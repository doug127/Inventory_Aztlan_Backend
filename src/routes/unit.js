import Router from 'express';
import { auth } from '../middlewares/auth.js';
import { authorizeRole } from '../middlewares/authorize.js';
import { ROLE_NAMES } from '../utils/ROLE_NAMES.js';
import {
    getAllUnitsController,
    getUnitByIdController,
    createUnitController,
    updateUnitController,
    deleteUnitController    
} from '../controllers/unit.js';

const router = Router();

router.get('/', auth, authorizeRole(ROLE_NAMES.USER), getAllUnitsController);
router.get('/:id', auth, authorizeRole(ROLE_NAMES.USER), getUnitByIdController);
router.post('/create', auth, authorizeRole(ROLE_NAMES.ADMIN), createUnitController);
router.put('/update/:id', auth, authorizeRole(ROLE_NAMES.ADMIN), updateUnitController);
router.delete('/destroy/:id', auth, authorizeRole(ROLE_NAMES.SUPERADMIN), deleteUnitController);

export default router;