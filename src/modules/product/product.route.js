import { Router } from 'express';
import { 
    getAllProductsController, 
    getProductByIdController,
    getAllByFilterProductsController,
    createProductController,
    updateProductController,
    deleteProductController
} from './product.controller.js';
import { auth } from '#src/shared/middlewares/auth.middleware.js';
import { authorizeRole } from '#src/shared/middlewares/authorize.middleware.js';
import { ROLE_NAMES } from '#src/shared/constants/ROLE_NAMES.js';

const router = Router();

router.get('/', auth, authorizeRole(ROLE_NAMES.USER), getAllProductsController);
router.get('/filter', auth, authorizeRole(ROLE_NAMES.USER), getAllByFilterProductsController);
router.get('/:id', auth, authorizeRole(ROLE_NAMES.USER), getProductByIdController);
router.post('/create', auth, authorizeRole(ROLE_NAMES.ADMIN), createProductController);
router.put('/update/:id', auth, authorizeRole(ROLE_NAMES.ADMIN), updateProductController);
router.delete('/delete/:id', auth, authorizeRole(ROLE_NAMES.SUPERADMIN), deleteProductController);

export default router;