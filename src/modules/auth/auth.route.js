import { Router } from 'express';
import { auth } from '#src/shared/middlewares/auth.middleware.js';
import { validate } from '#src/shared/middlewares/validate.middleware.js';
import {
  forgotPasswordRateLimiter,
  loginRateLimiter,
  resetPasswordRateLimiter,
} from '#src/shared/middlewares/rateLimit.middleware.js';
import {
  ChangePasswordSchema,
  ForgotPasswordSchema,
  LoginSchema,
  ResetPasswordSchema,
  ResetTokenQuerySchema,
  SessionIdParamsSchema,
} from './auth.schema.js';
import {
  changePasswordController,
  forgotPasswordController,
  loginController,
  logoutController,
  meController,
  refreshController,
  resetPasswordController,
  validateResetTokenController,
  listSessionsController,
  revokeSessionController,
  revokeOtherSessionsController,
} from './auth.controller.js';

const router = Router();

router.post('/login', loginRateLimiter, validate(LoginSchema), loginController);
// Sin auth: el access token puede estar vencido; la credencial es la cookie del refresh token.
router.post('/refresh', refreshController);
router.get('/me', auth, meController);
router.post('/change-password', auth, validate(ChangePasswordSchema), changePasswordController);
router.post('/logout', auth, logoutController);

// Sesiones activas del propio usuario (HU-109). La cookie del refresh token viaja a /api/auth,
// así que el servidor sabe cuál es la sesión de este dispositivo.
router.get('/sessions', auth, listSessionsController);
router.delete('/sessions', auth, revokeOtherSessionsController);
router.delete('/sessions/:id', auth, validate(SessionIdParamsSchema, 'params'), revokeSessionController);

// Recuperación de contraseña (sin sesión).
router.post('/forgot-password', forgotPasswordRateLimiter, validate(ForgotPasswordSchema), forgotPasswordController);
router.get('/reset-password/validate', validate(ResetTokenQuerySchema, 'query'), validateResetTokenController);
router.post('/reset-password', resetPasswordRateLimiter, validate(ResetPasswordSchema), resetPasswordController);

export default router;
