import { Router } from "express";
import { 
    createMovementController,
    getAllMovementsControllers,
    getMovementByIdController,
    getProductMovementsController
} from "../controllers/movement.js";
import { auth } from "../middlewares/auth.js";
import { authorizeRole } from "../middlewares/authorize.js";
import { ROLE_NAMES } from "../utils/ROLE_NAMES.js";
const router = Router();

router.get('/', auth, authorizeRole(ROLE_NAMES.USER), getAllMovementsControllers);
router.get('/:id', auth, authorizeRole(ROLE_NAMES.USER), getMovementByIdController);
router.get('/product/:id', auth, authorizeRole(ROLE_NAMES.USER), getProductMovementsController);
router.post('/', auth, authorizeRole(ROLE_NAMES.ADMIN), createMovementController);

export default router;