import { Router } from 'express';
import { validate } from '#src/shared/middlewares/validate.middleware.js';
import { auth } from '#src/shared/middlewares/auth.middleware.js';
import { authorizeRole } from '#src/shared/middlewares/authorize.middleware.js';
import { userSchema } from './user.schema.js';
import { 
  getUsersController,
  getUserByIdController,
  createUserController,
  updateUserController,
  deleteUserController
} from './user.controller.js';
import { ROLE_NAMES } from '#src/shared/constants/ROLE_NAMES.js';

const router = Router();

router.get('/', auth, authorizeRole(ROLE_NAMES.USER), getUsersController);
router.get('/:id', auth, authorizeRole(ROLE_NAMES.USER), getUserByIdController);
router.post('/create', auth, authorizeRole(ROLE_NAMES.ADMIN), validate(userSchema), createUserController);
router.put('/update/:id', auth, authorizeRole(ROLE_NAMES.ADMIN), validate(userSchema), updateUserController);
router.delete('/destroy/:id', auth, authorizeRole(ROLE_NAMES.SUPERADMIN), deleteUserController);

export default router;