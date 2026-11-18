import { z } from 'zod';

// Lista blanca de lo que ve el frontend del usuario autenticado. Nunca incluye passwordHash.
export const AuthUserDto = z.object({
  id: z.number().int(),
  username: z.string(),
  email: z.string(),
  fullName: z.string(),
  role: z.object({
    code: z.string(),
    name: z.string(),
    hierarchy: z.number().int(),
  }),
  mustChangePassword: z.boolean(),
  lastLoginAt: z.date().nullable(),
});

export const toAuthUserDto = (user) =>
  AuthUserDto.parse({
    id: user.id,
    username: user.username,
    email: user.email,
    fullName: user.fullName,
    role: { code: user.role.code, name: user.role.name, hierarchy: user.role.hierarchy },
    mustChangePassword: user.mustChangePassword,
    lastLoginAt: user.lastLoginAt ? new Date(user.lastLoginAt) : null,
  });

/**
 * Identidad del usuario en una petición (req.user) y "actor" que reciben los services.
 * El asistente IA arma este mismo objeto para llamar a los services con la identidad de quien pregunta.
 */
export const toSessionUser = (user) => ({
  id: user.id,
  username: user.username,
  roleCode: user.role.code,
  hierarchy: user.role.hierarchy,
  mustChangePassword: user.mustChangePassword,
});

// HU-109: una sesión activa (un dispositivo). Nunca incluye el hash del token.
// El id cambia en cada renovación (rotación); DELETE /sessions/:id acepta un id ya rotado.
export const SessionDto = z.object({
  id: z.string(),
  userAgent: z.string().nullable(),
  ipAddress: z.string().nullable(),
  lastActiveAt: z.date(),
  expiresAt: z.date(),
  current: z.boolean(),
});

export const toSessionDto = (token, current) =>
  SessionDto.parse({
    id: String(token.id),
    userAgent: token.userAgent ?? null,
    ipAddress: token.ipAddress ?? null,
    lastActiveAt: new Date(token.createdAt),
    expiresAt: new Date(token.expiresAt),
    current,
  });
