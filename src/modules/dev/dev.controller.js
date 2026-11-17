import { devResetLink } from '#src/database/scripts/dev-reset-link.js';
import { devWelcomePassword } from '#src/database/scripts/dev-welcome-password.js';
import { addLogContext, sendOk } from '#src/shared/http/response.js';

// Equivalente HTTP de `pnpm dev:reset-link`, para que Postman obtenga el token sin copiarlo a mano.
// El token nunca se escribe en el log: solo el correo de destino.
export const devResetTokenController = async (req, res) => {
  const { email } = req.validated.body;
  addLogContext(res, { target: email });
  const { token, expiresAt, link } = await devResetLink(email);
  return sendOk(res, { token, expiresAt, link });
};

// Equivalente HTTP de `pnpm dev:welcome-password`: la contraseña temporal del alta de usuario (HU-107).
export const devWelcomePasswordController = async (req, res) => {
  const { email } = req.validated.body;
  addLogContext(res, { target: email });
  const { temporaryPassword } = await devWelcomePassword(email);
  return sendOk(res, { temporaryPassword });
};
