// dayBounds (HU-501): los días 'AAAA-MM-DD' de los filtros se cortan en la hora del servidor, no en la
// de la sesión de PostgreSQL (UTC). Un movimiento a las 22:30 del 27 es del 27, no del 28.
import { describe, it, expect } from 'vitest';
import { dayBounds } from '#src/shared/schemas/dates.js';

describe('dayBounds', () => {
  it('desde el inicio de from hasta el inicio del día siguiente a to, en hora local', () => {
    const { fromStart, toEnd } = dayBounds({ from: '2026-11-01', to: '2026-11-27' });
    expect([fromStart.getFullYear(), fromStart.getMonth(), fromStart.getDate(), fromStart.getHours()]).toEqual([2026, 10, 1, 0]);
    expect([toEnd.getFullYear(), toEnd.getMonth(), toEnd.getDate(), toEnd.getHours()]).toEqual([2026, 10, 28, 0]);
    const lateEvening = new Date(2026, 10, 27, 22, 30);
    expect(lateEvening >= fromStart && lateEvening < toEnd).toBe(true);
  });

  it('cruza el fin de mes y de año, y deja undefined lo que no viene', () => {
    expect(dayBounds({ to: '2026-12-31' }).toEnd.getTime()).toBe(new Date(2027, 0, 1).getTime());
    expect(dayBounds({})).toEqual({ fromStart: undefined, toEnd: undefined });
  });
});
