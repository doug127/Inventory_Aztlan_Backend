import {Router} from 'express';
import { 
    getAllStocksController,
    // increaseStockController,
    // decreaseStockController
    adjustStockController
} from '../controllers/stock.js';
import { auth } from '../middlewares/auth.js';
import { authorizeRole } from '../middlewares/authorize.js';   
import { ROLE_NAMES } from '../utils/ROLE_NAMES.js'; 

const router = Router();

router.get('/', auth, authorizeRole(ROLE_NAMES.USER), getAllStocksController);
// router.post('/increase', auth, increaseStockController);
// router.post('/decrease', auth, decreaseStockController);
// router.post('/adjust', auth, adjustStockController);

export default router;