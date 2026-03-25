import express from "express";
import { auth } from '../middlewares/auth.js';
import { 
    authorizePrivilege, 
    authorizeHierarchy 
} from '../middlewares/authorize.js';
import {
    createReasonController,
    getAllReasonsController,
    getReasonByIdController,
    updateReasonController,
    deleteReasonController
} from "../controllers/reasons.js";
import {
  level_hierarchy as lh
} from '../utils/level_hierarchy.js';

const router = express.Router();

router.get("/", auth, getAllReasonsController);
router.get("/:id", auth, getReasonByIdController);
router.post(
    "/create", 
    auth, 
    authorizePrivilege("movements.modify_reasons"), 
    authorizeHierarchy(lh.SUPERADMIN), 
    createReasonController
);
router.patch(
    "/update/:id", 
    authorizePrivilege("movements.modify_reasons"), 
    authorizeHierarchy(lh.SUPERADMIN), 
    updateReasonController
);
router.delete(
    "/destroy/:id", 
    authorizePrivilege("movements.modify_reasons"), 
    authorizeHierarchy(lh.SUPERADMIN), 
    deleteReasonController
);

export default router;