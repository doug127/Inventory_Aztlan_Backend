import { Router } from 'express';
import { validate } from '#src/shared/middlewares/validate.middleware.js';
import { auth } from '#src/shared/middlewares/auth.middleware.js';
import { authorizeRole } from '#src/shared/middlewares/authorize.middleware.js';
import { ROLE_CODES } from '#src/shared/constants/roles.js';
import { CreateUserSchema, ListUsersQuerySchema, UpdateUserSchema, UserIdParamsSchema } from './user.schema.js';
import {
  activateUserController,
  createUserController,
  deactivateUserController,
  forcePasswordResetController,
  getUserController,
  listAssignableRolesController,
  listUsersController,
  unlockUserController,
  revokeUserSessionsController,
  updateUserController,
} from './user.controller.js';

const router = Router();

// Gestión de usuarios: ADMIN como mínimo (business_rules.md §8.2). La jerarquía sobre cada
// usuario destino (rango inferior, último SUPERADMIN, uno mismo) la valida el service.
router.use(auth, authorizeRole(ROLE_CODES.ADMIN));

const byId = { params: UserIdParamsSchema };

// HU-107
router.get('/', validate(ListUsersQuerySchema, 'query'), listUsersController);
router.get('/assignable-roles', listAssignableRolesController);
router.get('/:id', validate(byId), getUserController);
router.post('/', validate(CreateUserSchema), createUserController);
router.patch('/:id', validate({ ...byId, body: UpdateUserSchema }), updateUserController);
router.post('/:id/deactivate', validate(byId), deactivateUserController);
router.post('/:id/activate', validate(byId), activateUserController);

// HU-108
router.post('/:id/unlock', validate(byId), unlockUserController);
router.post('/:id/force-password-reset', validate(byId), forcePasswordResetController);

// HU-109 (desde la ficha del usuario)
router.post('/:id/revoke-sessions', validate(byId), revokeUserSessionsController);

export default router;
