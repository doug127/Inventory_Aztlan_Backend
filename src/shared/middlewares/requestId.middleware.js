import { randomUUID } from 'node:crypto';

// Identificador por petición: viaja en el header X-Request-Id y en cada respuesta de error,
// para poder encontrar la línea del log que corresponde a un fallo reportado.
export const requestId = (req, res, next) => {
  const incoming = req.get('X-Request-Id');
  req.id = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
  res.set('X-Request-Id', req.id);
  next();
};
