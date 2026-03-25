import { Router } from "express";
import { 
    createMovementController,
    getAllMovementsControllers,
    getMovementByIdController,
    getProductMovementsController
} from "../controllers/movement.js";
import { auth } from "../middlewares/auth.js";
import { authorizeHierarchy, authorizePrivilege } from "../middlewares/authorize.js";
import { level_hierarchy } from "../utils/level_hierarchy.js";

const router = Router();

router.get('/', auth, getAllMovementsControllers);
router.get('/:id', auth, getMovementByIdController);
router.get('/product/:id', auth, getProductMovementsController);
router.post('/', 
    auth, 
    authorizeHierarchy(level_hierarchy.ADMIN), 
    createMovementController
);

export default router;