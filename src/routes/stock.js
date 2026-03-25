import {Router} from 'express';
import { 
    getAllStocksController,
    // increaseStockController,
    // decreaseStockController
    adjustStockController
} from '../controllers/stock.js';
import { auth } from '../middlewares/auth.js';

const router = Router();

router.get('/', auth, getAllStocksController);
// router.post('/increase', auth, increaseStockController);
// router.post('/decrease', auth, decreaseStockController);
router.post('/adjust', auth, adjustStockController);

export default router;