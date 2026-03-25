import { Router } from 'express';
import { auth } from '../middlewares/auth.js';
import { authorizePrivilege, authorizeHierarchy } from '../middlewares/authorize.js';
import {
    getAllCategoryProductsController,
    getCategoryProductByNameController,
    createCategoryProductController,
    updateCategoryProductController,
    deleteCategoryProductController
} from '../controllers/category_products.js';
import { level_hierarchy as lh } from '../utils/level_hierarchy.js';

const router = Router();

router.get('/', auth, authorizePrivilege('category_products.read'), getAllCategoryProductsController);
router.get('/:name', auth, authorizePrivilege('category_products.read'), getCategoryProductByNameController);
router.post('/create', auth, authorizePrivilege('category_products.create'), authorizeHierarchy(lh.ADMIN), createCategoryProductController);
router.put('/update/:id', auth, authorizePrivilege('category_products.update'), authorizeHierarchy(lh.ADMIN), updateCategoryProductController);
router.delete('/destroy/:id', auth, authorizePrivilege('category_products.delete'), authorizeHierarchy(lh.SUPERADMIN), deleteCategoryProductController);

export default router;