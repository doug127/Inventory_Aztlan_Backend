import * as userService from './user.service.js';
import { addLogContext, sendCreated, sendList, sendOk, sendPaginated } from '#src/shared/http/response.js';

// Sin try/catch: Express 5 lleva cualquier error de una función async al errorHandler.

const requestContext = (req) => ({ ip: req.ip, userAgent: req.get('User-Agent') });

const FORCE_RESET_MESSAGE =
  'Se cerraron las sesiones del usuario y se le envió un correo para fijar una contraseña nueva. Su contraseña anterior ya no funciona.';

export const listUsersController = async (req, res) =>
  sendPaginated(res, await userService.listUsers(req.user, req.validated.query));

export const listAssignableRolesController = async (req, res) =>
  sendOk(res, await userService.listAssignableRoles(req.user));

export const getUserController = async (req, res) =>
  sendOk(res, await userService.getUser(req.user, req.validated.params.id));

export const createUserController = async (req, res) => {
  const user = await userService.createUser(req.user, req.validated.body);
  addLogContext(res, { target: user.username, created: user.id, role: user.role.code });
  return sendCreated(res, user);
};

export const updateUserController = async (req, res) => {
  addLogContext(res, { target: req.validated.params.id, fields: Object.keys(req.validated.body).join(',') });
  return sendOk(res, await userService.updateUser(req.user, req.validated.params.id, req.validated.body));
};

export const deactivateUserController = async (req, res) => {
  addLogContext(res, { target: req.validated.params.id });
  return sendOk(res, await userService.deactivateUser(req.user, req.validated.params.id));
};

export const activateUserController = async (req, res) => {
  addLogContext(res, { target: req.validated.params.id });
  return sendOk(res, await userService.activateUser(req.user, req.validated.params.id));
};

export const unlockUserController = async (req, res) => {
  const result = await userService.unlockUser(req.user, req.validated.params.id, requestContext(req));
  addLogContext(res, { target: result.user.username, wasLocked: result.wasLocked });
  return sendOk(res, result);
};

export const forcePasswordResetController = async (req, res) => {
  const result = await userService.forcePasswordReset(req.user, req.validated.params.id, requestContext(req));
  addLogContext(res, { target: result.user.username, revokedSessions: result.revokedSessions });
  return sendOk(res, { message: FORCE_RESET_MESSAGE, ...result }, { status: 202 });
};

export const revokeUserSessionsController = async (req, res) => {
  const result = await userService.revokeUserSessions(req.user, req.validated.params.id, requestContext(req));
  addLogContext(res, { target: result.user.username, revokedSessions: result.revokedSessions });
  return sendOk(res, result);
};

export const listUserSessionsController = async (req, res) =>
  sendList(res, await userService.listUserSessions(req.user, req.validated.params.id));
