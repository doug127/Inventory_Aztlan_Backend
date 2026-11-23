import { Router } from "express";
import { 
    createMovementController,
    getAllMovementsControllers,
    getMovementByIdController,
    getProductMovementsController
} from "./movement.controller.js";
import { auth } from "#src/shared/middlewares/auth.middleware.js";
import { authorizeRole } from "#src/shared/middlewares/authorize.middleware.js";
import { validate } from "#src/shared/middlewares/validate.middleware.js";
import { MovementSchema } from "./movement.schema.js";
import { ROLE_NAMES } from "#src/shared/constants/ROLE_NAMES.js";

const router = Router();

router.get('/', auth, authorizeRole(ROLE_NAMES.USER), getAllMovementsControllers);
router.get('/:id', auth, authorizeRole(ROLE_NAMES.USER), getMovementByIdController);
router.get('/product/:id', auth, authorizeRole(ROLE_NAMES.USER), getProductMovementsController);
router.post('/', auth, authorizeRole(ROLE_NAMES.ADMIN), validate(MovementSchema), createMovementController);

export default router;