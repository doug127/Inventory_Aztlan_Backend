import { devResetLink } from '#src/database/scripts/dev-reset-link.js';
import { addLogContext, sendOk } from '#src/shared/http/response.js';

// Equivalente HTTP de `pnpm dev:reset-link`, para que Postman obtenga el token sin copiarlo a mano.
// El token nunca se escribe en el log: solo el correo de destino.
export const devResetTokenController = async (req, res) => {
  const { email } = req.validated.body;
  addLogContext(res, { target: email });
  const { token, expiresAt, link } = await devResetLink(email);
  return sendOk(res, { token, expiresAt, link });
};
