import { z } from 'zod';

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
  createdAt: z.date(),
  updatedAt: z.date(),
});

const toDate = (value) => (value ? new Date(value) : null);

export const toUserDto = (user, now = new Date()) => {
  const lockedUntil = toDate(user.lockedUntil);
  const isLocked = Boolean(lockedUntil) && lockedUntil > now;
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
