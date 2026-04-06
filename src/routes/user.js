import { Router } from 'express';
import { auth } from '../middlewares/auth.js';
import { authorizeRole } from '../middlewares/authorize.js';
import { 
  getUsersController,
  createUserController,
  updateUserController,
  deleteUserController
} from '../controllers/user.js';
import { ROLE_NAMES } from '../utils/ROLE_NAMES.js';

const router = Router();

router.get('/', auth, authorizeRole(ROLE_NAMES.USER), getUsersController);
router.post('/create', auth, authorizeRole(ROLE_NAMES.ADMIN), createUserController);
router.put('/update/:id', auth, authorizeRole(ROLE_NAMES.ADMIN), updateUserController);
router.delete('/destroy/:id', auth, authorizeRole(ROLE_NAMES.SUPERADMIN), deleteUserController);

export default router;