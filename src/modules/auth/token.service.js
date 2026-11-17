import { createHash, randomBytes, randomInt } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { AppError } from '#src/shared/errors/AppError.js';
import { ACCESS_TOKEN_TTL_SECONDS } from '#src/shared/constants/auth.js';

const ALGORITHM = 'HS256';

/** Token opaco de 32 bytes aleatorios (refresh y recuperación de contraseña). */
export const generateOpaqueToken = () => randomBytes(32).toString('base64url');

// Sin caracteres que se confunden al leerlos en un correo (I, l, O, 0, 1).
const TEMP_UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const TEMP_LOWER = 'abcdefghijkmnpqrstuvwxyz';
const TEMP_DIGIT = '23456789';
const pick = (alphabet) => alphabet[randomInt(alphabet.length)];

/**
 * Contraseña temporal aleatoria que cumple la política (business_rules.md §9.2.1): al menos una
 * mayúscula, una minúscula y un número. 12 caracteres de un alfabeto de 56 ≈ 69 bits.
 */
export const generateTemporaryPassword = (length = 12) => {
  const all = TEMP_UPPER + TEMP_LOWER + TEMP_DIGIT;
  const chars = [pick(TEMP_UPPER), pick(TEMP_LOWER), pick(TEMP_DIGIT)];
  while (chars.length < length) chars.push(pick(all));
  // Fisher–Yates con randomInt, para que los caracteres obligatorios no queden siempre al inicio.
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
};

/** SHA-256 en hex: es lo único que se guarda en la BD. */
export const hashToken = (token) => createHash('sha256').update(token).digest('hex');

const secret = () => {
  const value = process.env.JWT_SECRET;
  if (!value) throw new AppError('INTERNAL_ERROR', { message: 'JWT_SECRET no está configurado' });
  return value;
};

/**
 * Access token de 15 minutos (business_rules.md §9.3): sub, role_code, hierarchy e iat.
 * El rol va en el token solo como referencia; en cada petición se vuelve a leer de la BD.
 */
export const signAccessToken = (sessionUser) =>
  jwt.sign(
    { sub: String(sessionUser.id), role_code: sessionUser.roleCode, hierarchy: sessionUser.hierarchy },
    secret(),
    { algorithm: ALGORITHM, expiresIn: ACCESS_TOKEN_TTL_SECONDS }
  );

/** Devuelve el payload con userId numérico, o lanza AUTH_TOKEN_EXPIRED / AUTH_TOKEN_INVALID. */
export const verifyAccessToken = (token) => {
  let payload;
  try {
    payload = jwt.verify(token, secret(), { algorithms: [ALGORITHM] });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(error?.name === 'TokenExpiredError' ? 'AUTH_TOKEN_EXPIRED' : 'AUTH_TOKEN_INVALID', { cause: error });
  }

  const userId = Number(payload.sub);
  if (!Number.isInteger(userId) || userId <= 0) throw new AppError('AUTH_TOKEN_INVALID');
  return { ...payload, userId };
};
