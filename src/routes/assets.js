import { Router } from 'express';
import { auth } from "../middlewares/auth.js";
import { authorizePrivilege, authorizeHierarchy } from '../middlewares/authorize.js';
import {
    getAllAssetsController,
    getAssetByIdController,
    createAssetController,
    updateAssetController,
    deleteAssetController
} from '../controllers/assets.js';
import {
  level_hierarchy as lh
} from '../utils/level_hierarchy.js';

const router = Router();

router.get("/", auth, getAllAssetsController);
router.get("/:id", auth, getAssetByIdController);
router.post(
    "/create", 
    auth, 
    authorizePrivilege('asset.modify'), 
    authorizeHierarchy(lh.ADMIN),
    createAssetController
);
router.patch(
    "/:id", 
    auth, 
    authorizePrivilege('asset.modify'), 
    authorizeHierarchy(lh.ADMIN),
    updateAssetController
);
router.delete(
    "/:id", 
    auth,
    authorizePrivilege('asset.modify'), 
    authorizeHierarchy(lh.ADMIN),
    deleteAssetController
);

export default router;