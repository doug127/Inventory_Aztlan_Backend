import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authorizeRole } from '#src/shared/middlewares/authorize.middleware.js';
import { Role } from '#src/database/models/index.model.js';

vi.mock('#src/database/models/index.model.js', () => ({
  Role: {
    findOne: vi.fn()
  }
}));

describe('authorizeRole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks an admin when superadmin access is required', async () => {
    Role.findOne.mockResolvedValue({ name: 'superadmin', hierarchy_level: 3 });

    const req = {
      user: {
        role: 'admin',
        hierarchy_level: 2
      }
    };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
    const next = vi.fn();

    await authorizeRole('superadmin')(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows a superadmin when the required role is superadmin', async () => {
    Role.findOne.mockResolvedValue({ name: 'superadmin', hierarchy_level: 3 });

    const req = {
      user: {
        role: 'superadmin',
        hierarchy_level: 3
      }
    };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
    const next = vi.fn();

    await authorizeRole('superadmin')(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
