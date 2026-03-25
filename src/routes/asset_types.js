import { Router } from 'express';
import { auth } from "../middlewares/auth.js";
import { authorizePrivilege, authorizeHierarchy } from '../middlewares/authorize.js';
import {
    getAllAssetTypesController,
    getAssetTypeByIdController,
    createAssetTypeController,
    updateAssetTypeController,
    deleteAssetTypeController
} from '../controllers/asset_types.js';
import {
  level_hierarchy as lh
} from '../utils/level_hierarchy.js';

const router = Router();

router.get("/", auth, getAllAssetTypesController);
router.get("/:id", auth, getAssetTypeByIdController);
router.post(
    "/create", 
    auth, 
    authorizePrivilege('asset_type.modify'), 
    authorizeHierarchy(lh.ADMIN),
    createAssetTypeController
);
router.patch(
    "/:id", 
    auth, 
    authorizePrivilege('asset_type.modify'), 
    authorizeHierarchy(lh.ADMIN),
    updateAssetTypeController
);
router.delete(
    "/:id", 
    auth,
    authorizePrivilege('asset_type.modify'), 
    authorizeHierarchy(lh.ADMIN),
    deleteAssetTypeController
);

export default router;