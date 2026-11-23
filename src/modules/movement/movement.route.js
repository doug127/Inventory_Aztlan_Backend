import { Router } from 'express';
import { auth } from '#src/shared/middlewares/auth.middleware.js';
import { authorizeRole } from '#src/shared/middlewares/authorize.middleware.js';
import { validate } from '#src/shared/middlewares/validate.middleware.js';
import { ROLE_CODES } from '#src/shared/constants/roles.js';
import { CreateWithdrawalSchema, IdempotencyHeadersSchema, MovementIdParamsSchema } from './movement.schema.js';
import { createWithdrawalController, getMovementController } from './movement.controller.js';

const router = Router();

// Consultar: todos los roles. Registrar órdenes de retiro: ALMACENISTA o superior (business_rules.md
// §8.2). Los movimientos son inmutables: no hay PUT, PATCH ni DELETE (P1).
router.use(auth);

router.post(
  '/withdrawals',
  authorizeRole(ROLE_CODES.ALMACENISTA),
  validate({ headers: IdempotencyHeadersSchema, body: CreateWithdrawalSchema }),
  createWithdrawalController
);
router.get('/:id', validate({ params: MovementIdParamsSchema }), getMovementController);

export default router;
