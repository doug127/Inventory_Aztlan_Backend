import { z } from 'zod';

// Un evento de la bitácora de seguridad tal como lo ve el administrador.
export const SecurityEventDto = z.object({
  id: z.string(),
  eventType: z.string(),
  createdAt: z.date(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  // Lo que se escribió al iniciar sesión; para usuarios inexistentes es el único dato.
  usernameAttempted: z.string().nullable(),
  user: z
    .object({
      id: z.number().int(),
      username: z.string(),
      fullName: z.string(),
      role: z.object({ code: z.string(), name: z.string() }),
    })
    .nullable(),
});

export const toSecurityEventDto = (event) =>
  SecurityEventDto.parse({
    id: String(event.id),
    eventType: event.eventType,
    createdAt: new Date(event.createdAt),
    ipAddress: event.ipAddress ?? null,
    userAgent: event.userAgent ?? null,
    usernameAttempted: event.usernameAttempted ?? null,
    user: event.user
      ? {
          id: event.user.id,
          username: event.user.username,
          fullName: event.user.fullName,
          role: { code: event.user.role.code, name: event.user.role.name },
        }
      : null,
  });
