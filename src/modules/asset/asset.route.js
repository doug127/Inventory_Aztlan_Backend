import { Router } from 'express';
import { auth } from "#src/shared/middlewares/auth.middleware.js";
import { authorizeRole } from '#src/shared/middlewares/authorize.middleware.js';
import { validate } from '#src/shared/middlewares/validate.middleware.js';
import {
    getAllAssetsController,
    getAssetByIdController,
    createAssetController,
    updateAssetController,
    deleteAssetController
} from './asset.controller.js';
import { assetSchema } from './asset.schema.js';
import { ROLE_NAMES } from '#src/shared/constants/ROLE_NAMES.js';

const router = Router();

router.get("/", auth, getAllAssetsController);
router.get("/:id", auth, getAssetByIdController);
router.post( "/create", auth, authorizeRole(ROLE_NAMES.ADMIN), validate(assetSchema), createAssetController);
router.patch( "/:id", auth, authorizeRole(ROLE_NAMES.ADMIN), validate(assetSchema), updateAssetController);
router.delete( "/:id", auth, authorizeRole(ROLE_NAMES.ADMIN), deleteAssetController);

export default router;