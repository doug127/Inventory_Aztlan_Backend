import { Router } from 'express';
import { auth } from '#src/shared/middlewares/auth.middleware.js';
import { authorizeRole } from '#src/shared/middlewares/authorize.middleware.js';
import { validate } from '#src/shared/middlewares/validate.middleware.js';
import {
    getAllCategoryProductsController,
    getCategoryProductByNameController,
    getRootCategoriesController,
    createCategoryProductController,
    updateCategoryProductController,
    deleteCategoryProductController
} from './category_product.controller.js';
import { categoryProductSchema } from './category_product.schema.js';
import { ROLE_NAMES } from '#src/shared/constants/ROLE_NAMES.js';

const router = Router();

router.get('/', auth, authorizeRole(ROLE_NAMES.USER), getAllCategoryProductsController);
router.get('/root', auth, authorizeRole(ROLE_NAMES.USER), getRootCategoriesController);
router.get('/find/:name', auth, authorizeRole(ROLE_NAMES.USER), getCategoryProductByNameController);
router.post( '/create', 
    auth, 
    authorizeRole(ROLE_NAMES.ADMIN), 
    validate(categoryProductSchema), 
    createCategoryProductController
);
router.put('/update/:id',
    auth, 
    authorizeRole(ROLE_NAMES.ADMIN), 
    validate(categoryProductSchema), 
    updateCategoryProductController
);
router.delete('/destroy/:id', auth, authorizeRole(ROLE_NAMES.SUPERADMIN), deleteCategoryProductController);

export default router;