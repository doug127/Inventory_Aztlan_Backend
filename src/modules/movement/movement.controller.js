import * as movementService from './movement.service.js';
import { addLogContext, sendOk } from '#src/shared/http/response.js';

// Sin try/catch: Express 5 lleva cualquier error de una función async al errorHandler.

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

/** 201 con la orden nueva; 200 con la original si el Idempotency-Key ya se usó (meta.duplicated). */
export const createWithdrawalController = async (req, res) => {
  const { movement, duplicated, warnings } = await movementService.createWithdrawalOrder(req.validated.body, {
    actor: req.user,
    idempotencyKey: req.validated.headers?.['idempotency-key'],
  });
  addLogContext(res, { doc: movement.documentNumber, lines: movement.lines.length, duplicated });
  return sendOk(res, movement, { status: duplicated ? 200 : 201, meta: { duplicated, warnings } });
};
