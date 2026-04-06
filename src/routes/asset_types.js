import { Router } from 'express';
import { auth } from "../middlewares/auth.js";
import { authorizeRole } from '../middlewares/authorize.js';
import {
    getAllAssetTypesController,
    getAssetTypeByIdController,
    createAssetTypeController,
    updateAssetTypeController,
    deleteAssetTypeController
} from '../controllers/asset_types.js';
import { ROLE_NAMES } from '../utils/ROLE_NAMES.js';

const router = Router();

router.get("/", auth, getAllAssetTypesController);
router.get("/:id", auth, getAssetTypeByIdController);
router.post(
    "/create", 
    auth, 
    authorizeRole(ROLE_NAMES.ADMIN),
    createAssetTypeController
);
router.patch(
    "/:id", 
    auth, 
    authorizeRole(ROLE_NAMES.ADMIN),
    updateAssetTypeController
);
router.delete(
    "/:id", 
    auth,
    authorizeRole(ROLE_NAMES.ADMIN),
    deleteAssetTypeController
);

export default router;