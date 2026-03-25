import Router from 'express';
import {auth} from '../middlewares/auth.js';
import { 
    loginController, 
    me,
    logoutController } from '../controllers/auth.js';

const router = Router();

router.post('/login', loginController);
router.get('/me', auth, me);
router.post('/logout', logoutController);

export default router;