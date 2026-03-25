import express from "express";
import { auth } from "../middlewares/auth.js";
import { authorizePrivilege, authorizeHierarchy } from '../middlewares/authorize.js';
import {
  createMovementTypeController,
  getAllMovementTypesController,
  getMovementTypeByIdController,
  updateMovementTypeController,
  deleteMovementTypeController
} from "../controllers/movement_types.js";
import {
  level_hierarchy as lh
} from '../utils/level_hierarchy.js';

const router = express.Router();

router.get("/", auth, getAllMovementTypesController);
router.get("/:id", auth, getMovementTypeByIdController);
router.post(
    "/modify", 
    auth, 
    authorizePrivilege('movements.modify'), 
    authorizeHierarchy(lh.SUPERADMIN),
    createMovementTypeController);
router.patch(
    "/:id", 
    auth, 
    authorizePrivilege('movements.modify'), 
    authorizeHierarchy(lh.SUPERADMIN),
    updateMovementTypeController);
router.delete(
    "/:id", 
    auth,
    authorizePrivilege('movements.modify'), 
    authorizeHierarchy(lh.SUPERADMIN),
    deleteMovementTypeController
);

export default router;