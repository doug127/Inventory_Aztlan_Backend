import { Router } from 'express';
import { auth } from "../middlewares/auth.js";
import { authorizeRole } from '../middlewares/authorize.js';
import {
    getAllAssetsController,
    getAssetByIdController,
    createAssetController,
    updateAssetController,
    deleteAssetController
} from '../controllers/assets.js';
import { ROLE_NAMES } from '../utils/ROLE_NAMES.js';

const router = Router();

router.get("/", auth, getAllAssetsController);
router.get("/:id", auth, getAssetByIdController);
router.post( "/create", auth, authorizeRole(ROLE_NAMES.ADMIN), createAssetController);
router.patch( "/:id", auth, authorizeRole(ROLE_NAMES.ADMIN), updateAssetController);
router.delete( "/:id", auth, authorizeRole(ROLE_NAMES.ADMIN), deleteAssetController);

export default router;