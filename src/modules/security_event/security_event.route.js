import { Router } from 'express';
import { auth } from '#src/shared/middlewares/auth.middleware.js';
import { authorizeRole } from '#src/shared/middlewares/authorize.middleware.js';
import { validate } from '#src/shared/middlewares/validate.middleware.js';
import { ROLE_CODES } from '#src/shared/constants/roles.js';
import { ListSecurityEventsQuerySchema } from './security_event.schema.js';
import { listEventTypesController, listSecurityEventsController } from './security_event.controller.js';

const router = Router();

// Bitácora de seguridad (HU-110): solo lectura y solo para el SUPERADMIN (decisión del 2026-11-17;
// business_rules.md §8.2 se debe actualizar: antes también la veía el ADMIN).
router.use(auth, authorizeRole(ROLE_CODES.SUPERADMIN));

router.get('/', validate(ListSecurityEventsQuerySchema, 'query'), listSecurityEventsController);
router.get('/event-types', listEventTypesController);

export default router;
