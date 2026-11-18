import { z } from 'zod';

// Estado de conexión (HU-109). Las sesiones se renuevan cada ~15 min mientras el usuario usa la
// app, así que una renovación en los últimos 20 min indica actividad reciente.
export const ONLINE_WINDOW_MS = 20 * 60 * 1000;
export const SESSION_STATUS = Object.freeze({
  ONLINE: 'ONLINE', // sesión abierta con actividad reciente
  IDLE: 'IDLE', // sesión abierta, sin actividad reciente
  OFFLINE: 'OFFLINE', // sin sesiones abiertas
});

// Lista blanca de lo que ve el administrador de cada usuario. Nunca incluye passwordHash.
export const UserDto = z.object({
  id: z.number().int(),
  username: z.string(),
  email: z.string(),
  fullName: z.string(),
  role: z.object({
    code: z.string(),
    name: z.string(),
    hierarchy: z.number().int(),
  }),
  isActive: z.boolean(),
  mustChangePassword: z.boolean(),
  isLocked: z.boolean(),
  lockedUntil: z.date().nullable(),
  failedLoginAttempts: z.number().int(),
  lastLoginAt: z.date().nullable(),
  sessions: z.object({
    active: z.number().int(),
    lastActivityAt: z.date().nullable(),
    status: z.enum(Object.values(SESSION_STATUS)),
  }),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const toDate = (value) => (value ? new Date(value) : null);

const sessionStatus = (active, lastActivityAt, now) => {
  if (!active) return SESSION_STATUS.OFFLINE;
  return lastActivityAt && now - lastActivityAt <= ONLINE_WINDOW_MS ? SESSION_STATUS.ONLINE : SESSION_STATUS.IDLE;
};

export const toUserDto = (user, now = new Date()) => {
  const lockedUntil = toDate(user.lockedUntil);
  const isLocked = Boolean(lockedUntil) && lockedUntil > now;
  const activeSessions = Number(user.activeSessions ?? 0);
  const lastActivityAt = activeSessions ? toDate(user.lastActivityAt) : null;
  return UserDto.parse({
    id: user.id,
    username: user.username,
    email: user.email,
    fullName: user.fullName,
    role: { code: user.role.code, name: user.role.name, hierarchy: user.role.hierarchy },
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    isLocked,
    // Un bloqueo vencido ya no aplica: se muestra solo el vigente.
    lockedUntil: isLocked ? lockedUntil : null,
    failedLoginAttempts: user.failedLoginAttempts,
    lastLoginAt: toDate(user.lastLoginAt),
    sessions: { active: activeSessions, lastActivityAt, status: sessionStatus(activeSessions, lastActivityAt, now) },
    createdAt: new Date(user.createdAt),
    updatedAt: new Date(user.updatedAt),
  });
};

export const RoleDto = z.object({
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  hierarchy: z.number().int(),
});

export const toRoleDto = (role) =>
  RoleDto.parse({ code: role.code, name: role.name, description: role.description ?? null, hierarchy: role.hierarchy });
