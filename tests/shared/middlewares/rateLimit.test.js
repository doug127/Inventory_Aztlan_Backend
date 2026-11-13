// Limitador por IP con el sobre estándar. Se prueba con límites pequeños en una app aparte,
// porque en las demás pruebas el límite de login se sube (todas salen de 127.0.0.1).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import { createRateLimiter } from '#src/shared/middlewares/rateLimit.middleware.js';
import { requestId } from '#src/shared/middlewares/requestId.middleware.js';
import { errorHandler } from '#src/shared/middlewares/errorHandler.middleware.js';
import { startServer } from '../../helpers/http.js';

let api;

beforeAll(async () => {
  const app = express();
  app.use(requestId);
  app.get('/todo', createRateLimiter({ windowMs: 60_000, limit: 3, message: 'Espere un minuto' }), (_req, res) =>
    res.json({ success: true })
  );
  // Imita el login: solo cuentan las respuestas fallidas.
  app.get('/solo-fallos/:ok', createRateLimiter({ windowMs: 60_000, limit: 2, skipSuccessfulRequests: true }), (req, res) =>
    res.status(req.params.ok === 'si' ? 200 : 401).json({ success: req.params.ok === 'si' })
  );
  app.use(errorHandler);
  api = await startServer(app);
});

afterAll(() => api?.close());

describe('createRateLimiter', () => {
  it('al superar el límite responde 429 AUTH_RATE_LIMITED con Retry-After y el sobre estándar', async () => {
    for (let i = 0; i < 3; i += 1) expect((await api.get('/todo')).status).toBe(200);

    const blocked = await api.get('/todo');
    expect(blocked.status).toBe(429);
    expect(blocked.body).toMatchObject({
      success: false,
      error: { code: 'AUTH_RATE_LIMITED', message: 'Espere un minuto', details: { retryAfterSeconds: expect.any(Number) } },
    });
    expect(blocked.body.error.requestId).toBeTruthy();
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('con skipSuccessfulRequests solo cuentan las respuestas fallidas', async () => {
    for (let i = 0; i < 5; i += 1) expect((await api.get('/solo-fallos/si')).status).toBe(200);
    expect((await api.get('/solo-fallos/no')).status).toBe(401);
    expect((await api.get('/solo-fallos/no')).status).toBe(401);
    expect((await api.get('/solo-fallos/no')).status).toBe(429);
  });
});
