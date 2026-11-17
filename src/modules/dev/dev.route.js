// Herramientas SOLO PARA DESARROLLO bajo /api/dev. Ver dev.guard.js para las condiciones.
import { Router } from 'express';
import { validate } from '#src/shared/middlewares/validate.middleware.js';
import { ForgotPasswordSchema } from '#src/modules/auth/auth.schema.js';
import { devToolsGuard } from './dev.guard.js';
import { devResetTokenController } from './dev.controller.js';

const router = Router();

router.use(devToolsGuard);

// Entrega el token del último correo PASSWORD_RESET pendiente (lo que hará el worker de HU-106).
router.post('/reset-token', validate(ForgotPasswordSchema), devResetTokenController);

export default router;
