import express from "express";
import { auth } from "../middlewares/auth.js";
import { authorizeRole } from '../middlewares/authorize.js';
import {
  createMovementTypeController,
  getAllMovementTypesController,
  getMovementTypeByIdController,
  updateMovementTypeController,
  deleteMovementTypeController
} from "../controllers/movement_types.js";
import { ROLE_NAMES } from '../utils/ROLE_NAMES.js';

const router = express.Router();

router.get("/", auth, authorizeRole(ROLE_NAMES.USER), getAllMovementTypesController);
router.get("/:id", auth, authorizeRole(ROLE_NAMES.USER), getMovementTypeByIdController);
router.post(
    "/modify", 
    auth, 
    authorizeRole(ROLE_NAMES.SUPERADMIN),
    createMovementTypeController);
router.patch(
    "/:id", 
    auth, 
    authorizeRole(ROLE_NAMES.SUPERADMIN),
    updateMovementTypeController);
router.delete(
    "/:id", 
    auth,
    authorizeRole(ROLE_NAMES.SUPERADMIN), 
    deleteMovementTypeController
);

export default router;