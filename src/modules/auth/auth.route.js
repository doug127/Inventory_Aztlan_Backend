import Router from 'express';
import { auth } from '#src/shared/middlewares/auth.middleware.js';
import { validate } from '#src/shared/middlewares/validate.middleware.js';
import { loginSchema } from './auth.schema.js';
import { 
    loginController, 
    me,
    logoutController 
} from './auth.controller.js';

const router = Router();

router.post('/login', validate(loginSchema), loginController);
router.get('/me', auth, me);
router.post('/logout', logoutController);

export default router;