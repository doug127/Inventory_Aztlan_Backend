import Router from 'express';
import { auth } from '#src/shared/middlewares/auth.middleware.js';
import { authorizeRole } from '#src/shared/middlewares/authorize.middleware.js';
import { validate } from '#src/shared/middlewares/validate.middleware.js';
import {
    getAllUnitsController,
    getUnitByIdController,
    getBaseUnitsController,
    createUnitController,
    updateUnitController,
    deleteUnitController    
} from './unit.controller.js';
import { UnitSchema } from './unit.schema.js';
import { ROLE_NAMES } from '#src/shared/constants/ROLE_NAMES.js';


const router = Router();

router.get('/', auth, authorizeRole(ROLE_NAMES.USER), getAllUnitsController);
router.get('/base-units', auth, authorizeRole(ROLE_NAMES.USER), getBaseUnitsController);
router.get('/:id', auth, authorizeRole(ROLE_NAMES.USER), getUnitByIdController);
router.post('/create', auth, authorizeRole(ROLE_NAMES.ADMIN), validate(UnitSchema), createUnitController);
router.put('/update/:id', auth, authorizeRole(ROLE_NAMES.ADMIN), validate(UnitSchema), updateUnitController);
router.delete('/destroy/:id', auth, authorizeRole(ROLE_NAMES.SUPERADMIN), deleteUnitController);

export default router;