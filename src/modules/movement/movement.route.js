import { Router } from 'express';
import { auth } from '#src/shared/middlewares/auth.middleware.js';
import { authorizeRole } from '#src/shared/middlewares/authorize.middleware.js';
import { validate } from '#src/shared/middlewares/validate.middleware.js';
import { rawBody } from '#src/shared/middlewares/rawBody.middleware.js';
import { ROLE_CODES } from '#src/shared/constants/roles.js';
import { RECEIPT_FILE_MAX_BYTES, RECEIPT_FILE_MIME_TYPES } from '#src/shared/constants/movements.js';
import {
  CreateEntrySchema,
  CreateTransferSchema,
  CreateWithdrawalSchema,
  DocumentFileHeadersSchema,
  DocumentFileParamsSchema,
  DocumentFileQuerySchema,
  IdempotencyHeadersSchema,
  MovementIdParamsSchema,
} from './movement.schema.js';
import {
  attachDocumentFileController,
  createEntryController,
  createTransferController,
  createWithdrawalController,
  getDocumentFileController,
  getMovementController,
} from './movement.controller.js';

const router = Router();

// Consultar: todos los roles. Registrar órdenes de retiro, entradas y traslados: ALMACENISTA o superior (business_rules.md
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
router.get('/:id', validate({ params: MovementIdParamsSchema }), getMovementController);

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
