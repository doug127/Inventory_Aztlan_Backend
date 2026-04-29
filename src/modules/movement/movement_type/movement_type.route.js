import express from "express";
import { auth } from "#src/shared/middlewares/auth.middleware.js";
import { authorizeRole } from '#src/shared/middlewares/authorize.middleware.js';
import {
  createMovementTypeController,
  getAllMovementTypesController,
  getMovementTypeByIdController,
  updateMovementTypeController,
  deleteMovementTypeController
} from "./movement_type.controller.js";
import { ROLE_NAMES } from '#src/shared/constants/ROLE_NAMES.js';

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