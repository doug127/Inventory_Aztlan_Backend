import { Router } from 'express';
import { auth } from "#src/shared/middlewares/auth.middleware.js";
import { authorizeRole } from '#src/shared/middlewares/authorize.middleware.js';
import {
    getAllAssetTypesController,
    getAssetTypeByIdController,
    createAssetTypeController,
    updateAssetTypeController,
    deleteAssetTypeController
} from './asset_type.controller.js';
import { ROLE_NAMES } from '#src/shared/constants/ROLE_NAMES.js';

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