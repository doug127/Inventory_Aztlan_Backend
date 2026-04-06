import { Router } from 'express';
import { auth } from '../middlewares/auth.js';
import { authorizeRole } from '../middlewares/authorize.js';
import {
    getAllCategoryProductsController,
    getCategoryProductByNameController,
    createCategoryProductController,
    updateCategoryProductController,
    deleteCategoryProductController
} from '../controllers/category_products.js';
import { ROLE_NAMES } from '../utils/ROLE_NAMES.js';

const router = Router();

router.get('/', auth, authorizeRole(ROLE_NAMES.USER), getAllCategoryProductsController);
router.get('/:name', auth, authorizeRole(ROLE_NAMES.USER), getCategoryProductByNameController);
router.post('/create', auth, authorizeRole(ROLE_NAMES.ADMIN), createCategoryProductController);
router.put('/update/:id', auth, authorizeRole(ROLE_NAMES.ADMIN), updateCategoryProductController);
router.delete('/destroy/:id', auth, authorizeRole(ROLE_NAMES.SUPERADMIN), deleteCategoryProductController);

export default router;