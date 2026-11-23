import { z } from 'zod';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Fecha 'AAAA-MM-DD' (día completo en la hora del servidor) o fecha y hora ISO 8601.
 * endOfDay: `to` con solo la fecha incluye todo ese día, así que el límite es el inicio del día
 * siguiente y se compara con `<`.
 */
export const dateParam = (name, { endOfDay = false } = {}) =>
  z
    .string()
    .trim()
    .refine((value) => !Number.isNaN(Date.parse(DATE_ONLY.test(value) ? `${value}T00:00:00` : value)), {
      error: `${name} debe ser una fecha AAAA-MM-DD o una fecha y hora ISO 8601`,
    })
    .transform((value) => {
      if (!DATE_ONLY.test(value)) return new Date(value);
      const date = new Date(`${value}T00:00:00`);
      if (endOfDay) date.setDate(date.getDate() + 1);
      return date;
    })
    .optional();

/** Período { from, to } con `from` anterior a `to`; los dos son opcionales. */
export const periodFields = { from: dateParam('from'), to: dateParam('to', { endOfDay: true }) };
export const periodIsOrdered = [(q) => !q.from || !q.to || q.from < q.to, { error: 'from debe ser anterior a to', path: ['from'] }];
