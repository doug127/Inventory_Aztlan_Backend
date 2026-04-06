import express from "express";
import { auth } from '../middlewares/auth.js';
import { authorizeRole } from '../middlewares/authorize.js';
import {
    createReasonController,
    getAllReasonsController,
    getReasonByIdController,
    updateReasonController,
    deleteReasonController
} from "../controllers/reasons.js";
import { ROLE_NAMES } from "../utils/ROLE_NAMES.js";

const router = express.Router();

router.get("/", auth, authorizeRole(ROLE_NAMES.USER), getAllReasonsController);
router.get("/:id", auth, authorizeRole(ROLE_NAMES.USER), getReasonByIdController);
router.post(
    "/create", 
    auth, 
    authorizeRole(ROLE_NAMES.SUPERADMIN), 
    createReasonController
);
router.patch(
    "/update/:id", 
    auth,
    authorizeRole(ROLE_NAMES.SUPERADMIN), 
    updateReasonController
);
router.delete(
    "/destroy/:id", 
    auth,
    authorizeRole(ROLE_NAMES.SUPERADMIN), 
    deleteReasonController
);

export default router;