import * as securityEventService from './security_event.service.js';
import { sendList, sendPaginated } from '#src/shared/http/response.js';

export const listSecurityEventsController = async (req, res) =>
  sendPaginated(res, await securityEventService.listSecurityEvents(req.user, req.validated.query));

export const listEventTypesController = async (_req, res) => sendList(res, securityEventService.listEventTypes());
