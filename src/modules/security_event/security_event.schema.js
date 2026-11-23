import { z } from 'zod';
import { AUTH_EVENT_TYPES } from '#src/shared/constants/auth.js';
import { dateParam } from '#src/shared/schemas/dates.js';

// Filtros de la bitácora de seguridad (HU-110, user_flow.md §15): usuario, tipo, IP y fecha.

const EVENT_TYPE_VALUES = Object.values(AUTH_EVENT_TYPES);

export const ListSecurityEventsQuerySchema = z
  .object({
    page: z.coerce.number().int('page debe ser un entero').min(1, 'page debe ser mayor o igual a 1').default(1),
    limit: z.coerce.number().int('limit debe ser un entero').min(1, 'limit mínimo 1').max(100, 'limit máximo 100').default(50),
    userId: z.coerce.number().int('userId debe ser un entero').positive('userId debe ser positivo').optional(),
    // Coincidencia parcial con el username del usuario o con el que se intentó (usuarios inexistentes).
    username: z.string().trim().toLowerCase().max(150, 'username es demasiado largo').optional().transform((v) => v || undefined),
    // Uno o varios tipos separados por coma: eventType=LOGIN_FAILED,ACCOUNT_LOCKED
    eventType: z
      .string()
      .trim()
      .toUpperCase()
      .transform((value) => [...new Set(value.split(',').map((t) => t.trim()).filter(Boolean))])
      .refine((types) => types.length > 0 && types.every((t) => EVENT_TYPE_VALUES.includes(t)), {
        error: `eventType debe ser uno o varios de: ${EVENT_TYPE_VALUES.join(', ')}`,
      })
      .optional(),
    ip: z.union([z.ipv4(), z.ipv6()], { error: 'ip debe ser una dirección IPv4 o IPv6' }).optional(),
    from: dateParam('from'),
    to: dateParam('to', { endOfDay: true }),
    order: z.enum(['asc', 'desc'], { error: 'order debe ser asc o desc' }).default('desc'),
  })
  .refine((q) => !q.from || !q.to || q.from < q.to, { error: 'from debe ser anterior a to', path: ['from'] });
