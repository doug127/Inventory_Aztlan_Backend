import {Router} from 'express';
import { 
    getAllStocksController,
    // increaseStockController,
    // decreaseStockController
    adjustStockController
} from './stock.controller.js';
import { auth } from '#src/shared/middlewares/auth.middleware.js';
import { authorizeRole } from '#src/shared/middlewares/authorize.middleware.js'; 
import { ROLE_NAMES } from '#src/shared/constants/ROLE_NAMES.js'; 

const router = Router();

router.get('/', auth, authorizeRole(ROLE_NAMES.USER), getAllStocksController);
// router.post('/increase', auth, increaseStockController);
// router.post('/decrease', auth, decreaseStockController);
// router.post('/adjust', auth, adjustStockController);

export default router;