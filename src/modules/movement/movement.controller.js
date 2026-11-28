import * as movementService from './movement.service.js';
import { addLogContext, sendFile, sendOk, sendPaginated } from '#src/shared/http/response.js';

// Sin try/catch: Express 5 lleva cualquier error de una función async al errorHandler.

/** Corrección con un movimiento inverso (HU-406): 201 con el inverso; 200 si el Idempotency-Key ya se usó. */
export const createCorrectionController = async (req, res) => {
  const { movement, duplicated, warnings } = await movementService.createCorrection(req.validated.params.id, req.validated.body, {
    actor: req.user,
    idempotencyKey: req.validated.headers?.['idempotency-key'],
  });
  addLogContext(res, { doc: movement.documentNumber, corrects: req.validated.params.id, lines: movement.lines.length, duplicated });
  return sendOk(res, movement, { status: duplicated ? 200 : 201, meta: { duplicated, warnings } });
};

/** Préstamos pendientes de devolver (HU-405). Todos los roles. */
export const listPendingLoansController = async (req, res) => sendPaginated(res, await movementService.listPendingLoans(req.validated.query));

export const getMovementController = async (req, res) => sendOk(res, await movementService.getMovement(req.validated.params.id));

/** Entrada (HU-402): 201 con la nueva; 200 con la original si el Idempotency-Key ya se usó. */
export const createEntryController = async (req, res) => {
  const { movement, duplicated, warnings } = await movementService.createEntry(req.validated.body, {
    actor: req.user,
    idempotencyKey: req.validated.headers?.['idempotency-key'],
  });
  addLogContext(res, { doc: movement.documentNumber, lines: movement.lines.length, duplicated });
  return sendOk(res, movement, { status: duplicated ? 200 : 201, meta: { duplicated, warnings } });
};

/** Ajuste por conteo físico (HU-404): 201 con el nuevo; 200 con el original si el Idempotency-Key ya se usó. */
export const createAdjustmentController = async (req, res) => {
  const { movement, duplicated, warnings } = await movementService.createAdjustment(req.validated.body, {
    actor: req.user,
    idempotencyKey: req.validated.headers?.['idempotency-key'],
  });
  addLogContext(res, { doc: movement.documentNumber, lines: movement.lines.length, duplicated });
  return sendOk(res, movement, { status: duplicated ? 200 : 201, meta: { duplicated, warnings } });
};

/** Traslado (HU-403): 201 con el nuevo; 200 con el original si el Idempotency-Key ya se usó. */
export const createTransferController = async (req, res) => {
  const { movement, duplicated, warnings } = await movementService.createTransfer(req.validated.body, {
    actor: req.user,
    idempotencyKey: req.validated.headers?.['idempotency-key'],
  });
  addLogContext(res, { doc: movement.documentNumber, lines: movement.lines.length, duplicated });
  return sendOk(res, movement, { status: duplicated ? 200 : 201, meta: { duplicated, warnings } });
};

/** 201 con la orden nueva; 200 con la original si el Idempotency-Key ya se usó (meta.duplicated). */
export const createWithdrawalController = async (req, res) => {
  const { movement, duplicated, warnings } = await movementService.createWithdrawalOrder(req.validated.body, {
    actor: req.user,
    idempotencyKey: req.validated.headers?.['idempotency-key'],
  });
  addLogContext(res, { doc: movement.documentNumber, lines: movement.lines.length, duplicated });
  return sendOk(res, movement, { status: duplicated ? 200 : 201, meta: { duplicated, warnings } });
};

/** Adjunta el archivo escaneado de un documento de recepción. El cuerpo es el archivo (Buffer, rawBody). */
export const attachDocumentFileController = async (req, res) => {
  const { id, documentId } = req.validated.params;
  const headers = req.validated.headers;
  const document = await movementService.attachDocumentFile(
    id,
    documentId,
    { buffer: req.body, mimeType: headers['content-type'], originalName: headers['x-file-name'] },
    { actor: req.user }
  );
  addLogContext(res, { movement: id, document: documentId, bytes: document.file.sizeBytes });
  return sendOk(res, document);
};

export const getDocumentFileController = async (req, res) => {
  const { id, documentId } = req.validated.params;
  const file = await movementService.getDocumentFile(id, documentId);
  addLogContext(res, { movement: id, document: documentId, bytes: file.buffer.length });
  return sendFile(res, { ...file, disposition: req.validated.query.disposition });
};
