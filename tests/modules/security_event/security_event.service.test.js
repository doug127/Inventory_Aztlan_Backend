// Unitaria del service de la bitácora (HU-110) con el repository simulado.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('#src/modules/security_event/security_event.repository.js', () => ({ listSecurityEvents: vi.fn() }));

const repo = await import('#src/modules/security_event/security_event.repository.js');
const service = await import('#src/modules/security_event/security_event.service.js');

const query = { page: 1, limit: 50, order: 'desc' };
const event = {
  id: '10',
  eventType: 'LOGIN_FAILED',
  createdAt: new Date('2026-11-17T10:00:00Z'),
  ipAddress: '10.0.0.5',
  userAgent: null,
  usernameAttempted: 'pedro.gomez',
  user: { id: 7, username: 'pedro.gomez', fullName: 'Pedro Gómez', role: { code: 'ALMACENISTA', name: 'Almacenista', hierarchy: 2 } },
};

beforeEach(() => {
  vi.clearAllMocks();
  repo.listSecurityEvents.mockResolvedValue({ items: [event], total: 1 });
});

describe('listSecurityEvents', () => {
  it('pasa los filtros al repository sin restricciones de visibilidad (solo el SUPERADMIN llega aquí)', async () => {
    await service.listSecurityEvents(query);
    expect(repo.listSecurityEvents).toHaveBeenCalledWith(query);
  });

  it('devuelve el DTO y los filtros aplicados en meta', async () => {
    const from = new Date('2026-11-01T00:00:00Z');
    const result = await service.listSecurityEvents({ ...query, eventType: ['LOGIN_FAILED'], from });
    expect(result.items[0]).toEqual({
      id: '10',
      eventType: 'LOGIN_FAILED',
      createdAt: event.createdAt,
      ipAddress: '10.0.0.5',
      userAgent: null,
      usernameAttempted: 'pedro.gomez',
      user: { id: 7, username: 'pedro.gomez', fullName: 'Pedro Gómez', role: { code: 'ALMACENISTA', name: 'Almacenista' } },
    });
    expect(result.filters).toEqual({ eventType: ['LOGIN_FAILED'], from: '2026-11-01T00:00:00.000Z' });
    expect(result.sort).toEqual({ field: 'createdAt', order: 'desc' });
  });
});
