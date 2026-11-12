// Prueba HTTP real: una app Express con la misma cadena de middlewares que app.js,
// levantada en un puerto efímero y consultada con fetch.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import { z } from 'zod';
import { DatabaseError } from 'sequelize';
import { AppError } from '#src/shared/errors/AppError.js';
import { requestId } from '#src/shared/middlewares/requestId.middleware.js';
import { requestLogger } from '#src/shared/middlewares/requestLogger.middleware.js';
import { validate } from '#src/shared/middlewares/validate.middleware.js';
import { authorizeRole } from '#src/shared/middlewares/authorize.middleware.js';
import { notFound } from '#src/shared/middlewares/notFound.middleware.js';
import { errorHandler } from '#src/shared/middlewares/errorHandler.middleware.js';

let server;
let baseUrl;

const asUser = (user) => (req, _res, next) => {
  req.user = user;
  next();
};

beforeAll(async () => {
  const app = express();
  app.use(requestId);
  app.use(requestLogger);
  app.use(express.json({ limit: '1kb' }));

  app.get('/app-error', () => {
    throw new AppError('INSUFFICIENT_STOCK', {
      message: 'Stock insuficiente de COMB-0001 en COMB',
      details: { available: '300.000', requested: '350.000' },
    });
  });
  app.get('/async-error', async () => {
    throw new AppError('NOT_FOUND', { message: 'Activo T-09 no encontrado' });
  });
  app.get('/db-error', async () => {
    throw new DatabaseError(Object.assign(new Error('traducido'), { code: 'P0001', message: 'MOVEMENT_IMMUTABLE: no' }));
  });
  app.get('/crash', () => {
    throw new Error('detalle interno con SQL: SELECT * FROM users');
  });
  app.get('/contract', () => {
    z.object({ id: z.number() }).parse({ id: 'x' });
  });
  app.post('/validate', validate(z.object({ code: z.string().regex(/^[A-Z]{4}$/), qty: z.number().positive() })), (req, res) =>
    res.json({ success: true, data: req.validated.body })
  );
  app.get('/query', validate(z.object({ page: z.coerce.number().int().positive() }), 'query'), (req, res) =>
    res.json({ success: true, data: req.validatedData })
  );
  app.get('/admin', asUser({ username: 'pedro', hierarchy: 2 }), authorizeRole('ADMIN'), (_req, res) => res.json({ ok: true }));
  app.get('/admin-ok', asUser({ username: 'ana', hierarchy: 0 }), authorizeRole('admin'), (_req, res) => res.json({ ok: true }));
  app.get('/admin-no-role', asUser({ username: 'x' }), authorizeRole('ADMIN'), (_req, res) => res.json({ ok: true }));
  app.post('/json', (_req, res) => res.json({ ok: true }));

  app.use(notFound);
  app.use(errorHandler);

  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => new Promise((resolve) => server.close(resolve)));

const call = async (path, init) => {
  const res = await fetch(baseUrl + path, init);
  return { status: res.status, headers: res.headers, body: await res.json() };
};

const postJson = (path, body) =>
  call(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });

describe('errorHandler', () => {
  it('responde un AppError con el sobre estándar y el requestId', async () => {
    const { status, headers, body } = await call('/app-error');
    expect(status).toBe(409);
    expect(body).toEqual({
      success: false,
      error: {
        code: 'INSUFFICIENT_STOCK',
        message: 'Stock insuficiente de COMB-0001 en COMB',
        details: { available: '300.000', requested: '350.000' },
        requestId: headers.get('x-request-id'),
      },
    });
  });

  it('captura errores de handlers async (Express 5)', async () => {
    const { status, body } = await call('/async-error');
    expect(status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('traduce errores de base de datos', async () => {
    const { status, body } = await call('/db-error');
    expect(status).toBe(409);
    expect(body.error.code).toBe('MOVEMENT_IMMUTABLE');
  });

  it('un error inesperado es 500 sin exponer detalles', async () => {
    const { status, body } = await call('/crash');
    expect(status).toBe(500);
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(body.error.message).toBe('Error interno del servidor');
    expect(body.error).not.toHaveProperty('details');
    expect(JSON.stringify(body)).not.toContain('SELECT');
  });

  it('un ZodError fuera de validate es RESPONSE_CONTRACT_ERROR (500)', async () => {
    const { status, body } = await call('/contract');
    expect(status).toBe(500);
    expect(body.error.code).toBe('RESPONSE_CONTRACT_ERROR');
    expect(body.error).not.toHaveProperty('details');
  });

  it('respeta un X-Request-Id válido enviado por el cliente', async () => {
    const { headers, body } = await call('/app-error', { headers: { 'X-Request-Id': 'abc12345-trace' } });
    expect(headers.get('x-request-id')).toBe('abc12345-trace');
    expect(body.error.requestId).toBe('abc12345-trace');
  });

  it('JSON mal formado es VALIDATION_ERROR', async () => {
    const { status, body } = await postJson('/json', '{"code": ');
    expect(status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toBe('El cuerpo de la petición no es JSON válido');
  });

  it('cuerpo demasiado grande es VALIDATION_ERROR', async () => {
    const { status, body } = await postJson('/json', JSON.stringify({ x: 'a'.repeat(5000) }));
    expect(status).toBe(400);
    expect(body.error.message).toBe('El cuerpo de la petición es demasiado grande');
  });
});

describe('notFound', () => {
  it('una ruta inexistente es ROUTE_NOT_FOUND', async () => {
    const { status, body } = await call('/no-existe');
    expect(status).toBe(404);
    expect(body.error).toMatchObject({ code: 'ROUTE_NOT_FOUND', message: 'No existe GET /no-existe' });
  });
});

describe('validate', () => {
  it('devuelve VALIDATION_ERROR con detalle por campo', async () => {
    const { status, body } = await postJson('/validate', JSON.stringify({ code: 'comb', qty: -1 }));
    expect(status).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ location: 'body', path: 'code' }),
        expect.objectContaining({ location: 'body', path: 'qty' }),
      ])
    );
  });

  it('deja los datos válidos en req.validated', async () => {
    const { status, body } = await postJson('/validate', JSON.stringify({ code: 'COMB', qty: 2 }));
    expect(status).toBe(200);
    expect(body.data).toEqual({ code: 'COMB', qty: 2 });
  });

  it('valida la parte indicada (query) y mantiene req.validatedData', async () => {
    expect((await call('/query?page=2')).body.data).toEqual({ page: 2 });
    const { status, body } = await call('/query?page=0');
    expect(status).toBe(400);
    expect(body.error.details[0]).toMatchObject({ location: 'query', path: 'page' });
  });
});

describe('authorizeRole', () => {
  it('rechaza un rol de menor rango con FORBIDDEN_ROLE', async () => {
    const { status, body } = await call('/admin');
    expect(status).toBe(403);
    expect(body.error).toMatchObject({ code: 'FORBIDDEN_ROLE', details: { requiredRole: 'ADMIN' } });
  });

  it('permite un rol de mayor rango (0 = SUPERADMIN) y acepta el nombre antiguo', async () => {
    expect((await call('/admin-ok')).status).toBe(200);
  });

  it('falla cerrado si el token no trae rol ni jerarquía', async () => {
    expect((await call('/admin-no-role')).status).toBe(403);
  });

  it('un rol mínimo desconocido falla al definir la ruta', () => {
    expect(() => authorizeRole('jefe')).toThrow(/rol desconocido/);
  });
});
