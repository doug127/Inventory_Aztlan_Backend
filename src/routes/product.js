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
import { authorizePrivilege, authorizeHierarchy } from '../middlewares/authorize.js';
import { level_hierarchy as lh } from '../utils/level_hierarchy.js';

const router = Router();

router.get('/', auth, authorizePrivilege('products.read'), getAllProductsController);
router.get('/filter', auth, authorizePrivilege('products.read'), getAllByFilterProductsController);
router.get('/:id', auth, authorizePrivilege('products.read'), getProductByIdController);
router.post('/create', auth, authorizePrivilege('products.create'), authorizeHierarchy(lh.ADMIN), createProductController);
router.put('/update/:id', auth, authorizePrivilege('products.update'), authorizeHierarchy(lh.ADMIN), updateProductController);
router.delete('/delete/:id', auth, authorizePrivilege('products.delete'), authorizeHierarchy(lh.SUPERADMIN), deleteProductController);

export default router;