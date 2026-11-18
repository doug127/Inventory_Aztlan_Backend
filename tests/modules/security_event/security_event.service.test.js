// Unitaria de la visibilidad de la bitácora (HU-110) con el repository simulado.
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
  it('un ADMIN ve lo suyo, lo de rango inferior y lo de usuarios inexistentes', async () => {
    await service.listSecurityEvents({ id: 3, roleCode: 'ADMIN', hierarchy: 1 }, query);
    expect(repo.listSecurityEvents).toHaveBeenCalledWith({ ...query, visibility: { selfId: 3, minHierarchyExclusive: 1 } });
  });

  it('el SUPERADMIN ve todo', async () => {
    await service.listSecurityEvents({ id: 1, roleCode: 'SUPERADMIN', hierarchy: 0 }, query);
    expect(repo.listSecurityEvents).toHaveBeenCalledWith({ ...query, visibility: null });
  });

  it('devuelve el DTO sin la jerarquía interna y los filtros aplicados en meta', async () => {
    const from = new Date('2026-11-01T00:00:00Z');
    const result = await service.listSecurityEvents({ id: 1, roleCode: 'SUPERADMIN', hierarchy: 0 }, { ...query, eventType: ['LOGIN_FAILED'], from });
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
