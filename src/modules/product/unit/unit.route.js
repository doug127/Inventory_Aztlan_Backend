import Router from 'express';
import { auth } from '#src/shared/middlewares/auth.middleware.js';
import { authorizeRole } from '#src/shared/middlewares/authorize.middleware.js';
import { ROLE_NAMES } from '#src/shared/constants/ROLE_NAMES.js';
import {
    getAllUnitsController,
    getUnitByIdController,
    createUnitController,
    updateUnitController,
    deleteUnitController    
} from './unit.controller.js';

const router = Router();

router.get('/', auth, authorizeRole(ROLE_NAMES.USER), getAllUnitsController);
router.get('/:id', auth, authorizeRole(ROLE_NAMES.USER), getUnitByIdController);
router.post('/create', auth, authorizeRole(ROLE_NAMES.ADMIN), createUnitController);
router.put('/update/:id', auth, authorizeRole(ROLE_NAMES.ADMIN), updateUnitController);
router.delete('/destroy/:id', auth, authorizeRole(ROLE_NAMES.SUPERADMIN), deleteUnitController);

export default router;