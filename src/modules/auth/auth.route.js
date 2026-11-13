import { Router } from 'express';
import { auth } from '#src/shared/middlewares/auth.middleware.js';
import { validate } from '#src/shared/middlewares/validate.middleware.js';
import { loginRateLimiter } from '#src/shared/middlewares/rateLimit.middleware.js';
import { ChangePasswordSchema, LoginSchema } from './auth.schema.js';
import {
  changePasswordController,
  loginController,
  logoutController,
  meController,
  refreshController,
} from './auth.controller.js';

const router = Router();

router.post('/login', loginRateLimiter, validate(LoginSchema), loginController);
// Sin auth: el access token puede estar vencido; la credencial es la cookie del refresh token.
router.post('/refresh', refreshController);
router.get('/me', auth, meController);
router.post('/change-password', auth, validate(ChangePasswordSchema), changePasswordController);
router.post('/logout', auth, logoutController);

export default router;
