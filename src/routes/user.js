import { Router } from 'express';
import { auth } from '../middlewares/auth.js';
import { authorizePrivilege, authorizeHierarchy } from '../middlewares/authorize.js';
import { 
  getUsersController,
  createUserController,
  updateUserController,
  deleteUserController
} from '../controllers/user.js';
import { level_hierarchy as lh } from '../utils/level_hierarchy.js';

const router = Router();

router.get('/', auth, authorizePrivilege('users.read'), getUsersController);
router.post('/create', auth, authorizePrivilege('users.create'),authorizeHierarchy(lh.ADMIN), createUserController);
router.put('/update/:id', auth, authorizePrivilege('users.update'), authorizeHierarchy(lh.ADMIN), updateUserController);
router.delete('/destroy/:id', auth, authorizePrivilege('users.delete'), authorizeHierarchy(lh.SUPERADMIN), deleteUserController);

export default router;