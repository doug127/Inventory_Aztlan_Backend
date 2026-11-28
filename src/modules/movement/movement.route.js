import { Router } from 'express';
import { auth } from '#src/shared/middlewares/auth.middleware.js';
import { authorizeRole } from '#src/shared/middlewares/authorize.middleware.js';
import { validate } from '#src/shared/middlewares/validate.middleware.js';
import { rawBody } from '#src/shared/middlewares/rawBody.middleware.js';
import { ROLE_CODES } from '#src/shared/constants/roles.js';
import { RECEIPT_FILE_MAX_BYTES, RECEIPT_FILE_MIME_TYPES } from '#src/shared/constants/movements.js';
import {
  CreateAdjustmentSchema,
  CreateCorrectionSchema,
  CreateEntrySchema,
  CreateTransferSchema,
  CreateWithdrawalSchema,
  ListMovementsQuerySchema,
  ListPendingLoansQuerySchema,
  DocumentFileHeadersSchema,
  DocumentFileParamsSchema,
  DocumentFileQuerySchema,
  IdempotencyHeadersSchema,
  MovementIdParamsSchema,
} from './movement.schema.js';
import {
  attachDocumentFileController,
  createAdjustmentController,
  createCorrectionController,
  createEntryController,
  createTransferController,
  createWithdrawalController,
  getDocumentFileController,
  getMovementController,
  listMovementsController,
  listPendingLoansController,
} from './movement.controller.js';

const router = Router();

// Consultar (también los préstamos pendientes): todos los roles. Registrar órdenes de retiro, entradas, devoluciones y traslados: ALMACENISTA o superior (business_rules.md
// §8.2). Los movimientos son inmutables: no hay PUT, PATCH ni DELETE (P1). La única excepción es adjuntar,
// una vez, el archivo escaneado de un documento de recepción.
router.use(auth);

router.post(
  '/withdrawals',
  authorizeRole(ROLE_CODES.ALMACENISTA),
  validate({ headers: IdempotencyHeadersSchema, body: CreateWithdrawalSchema }),
  createWithdrawalController
);
router.post(
  '/entries',
  authorizeRole(ROLE_CODES.ALMACENISTA),
  validate({ headers: IdempotencyHeadersSchema, body: CreateEntrySchema }),
  createEntryController
);
router.post(
  '/transfers',
  authorizeRole(ROLE_CODES.ALMACENISTA),
  validate({ headers: IdempotencyHeadersSchema, body: CreateTransferSchema }),
  createTransferController
);
// Ajustes por conteo físico: solo ADMIN y SUPERADMIN (business_rules.md §2.5 regla 1).
router.post(
  '/adjustments',
  authorizeRole(ROLE_CODES.ADMIN),
  validate({ headers: IdempotencyHeadersSchema, body: CreateAdjustmentSchema }),
  createAdjustmentController
);
// Historial (HU-408) y préstamos pendientes (HU-405): todos los roles. Van antes de /:id.
router.get('/', validate({ query: ListMovementsQuerySchema }), listMovementsController);
router.get('/loans/pending', validate({ query: ListPendingLoansQuerySchema }), listPendingLoansController);
router.get('/:id', validate({ params: MovementIdParamsSchema }), getMovementController);
// Corrección con un movimiento inverso (REV-{documento}): solo ADMIN y SUPERADMIN (business_rules.md §5).
router.post(
  '/:id/corrections',
  authorizeRole(ROLE_CODES.ADMIN),
  validate({ params: MovementIdParamsSchema, headers: IdempotencyHeadersSchema, body: CreateCorrectionSchema }),
  createCorrectionController
);

// Archivo de un documento de recepción (factura, vale, recibo). El cuerpo es el archivo crudo.
router.put(
  '/:id/documents/:documentId/file',
  authorizeRole(ROLE_CODES.ALMACENISTA),
  validate({ params: DocumentFileParamsSchema, headers: DocumentFileHeadersSchema }),
  rawBody({ types: Object.keys(RECEIPT_FILE_MIME_TYPES), limitBytes: RECEIPT_FILE_MAX_BYTES, tooLargeCode: 'DOCUMENT_FILE_TOO_LARGE' }),
  attachDocumentFileController
);
router.get(
  '/:id/documents/:documentId/file',
  validate({ params: DocumentFileParamsSchema, query: DocumentFileQuerySchema }),
  getDocumentFileController
);

export default router;
