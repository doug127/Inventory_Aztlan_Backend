import { Router } from 'express';
import { 
    getAllProductsController, 
    getProductByIdController,
    getAllByFilterProductsController,
    createProductController,
    updateProductController,
    deleteProductController
} from '../controllers/product.js';
import { auth } from '../middlewares/auth.js';
import { authorizeRole } from '../middlewares/authorize.js';
import { ROLE_NAMES } from '../utils/ROLE_NAMES.js';

const router = Router();

router.get('/', auth, authorizeRole(ROLE_NAMES.USER), getAllProductsController);
router.get('/filter', auth, authorizeRole(ROLE_NAMES.USER), getAllByFilterProductsController);
router.get('/:id', auth, authorizeRole(ROLE_NAMES.USER), getProductByIdController);
router.post('/create', auth, authorizeRole(ROLE_NAMES.ADMIN), createProductController);
router.put('/update/:id', auth, authorizeRole(ROLE_NAMES.ADMIN), updateProductController);
router.delete('/delete/:id', auth, authorizeRole(ROLE_NAMES.SUPERADMIN), deleteProductController);

export default router;