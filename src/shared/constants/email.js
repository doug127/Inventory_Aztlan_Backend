// Deben coincidir con email_template_enum y email_status_enum de la migración.
export const EMAIL_TEMPLATES = Object.freeze({
  WELCOME: 'WELCOME',
  PASSWORD_RESET: 'PASSWORD_RESET',
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
});

export const EMAIL_STATUS = Object.freeze({
  PENDING: 'PENDING',
  SENT: 'SENT',
  FAILED: 'FAILED',
});

// Worker de envío (HU-106). Los valores se pueden ajustar por .env (ver email.worker.js).
export const EMAIL_WORKER_DEFAULTS = Object.freeze({
  intervalMs: 10_000, // cada cuánto revisa la cola
  batchSize: 10, // cuántos correos toma por vuelta
  maxAttempts: 5, // después de esto el correo queda FAILED
  retryBaseMs: 60_000, // espera antes del 2.º intento; se duplica en cada fallo (1, 2, 4, 8 min)
  leaseMs: 5 * 60_000, // si el proceso cae a mitad de un envío, el correo vuelve a la cola tras este plazo
});

// Asunto de cada plantilla. El cuerpo no se guarda en la BD (db_schema.md §2): lo arma el worker
// de envío (HU-106) a partir de la plantilla, para que ningún enlace con token quede almacenado.
export const EMAIL_SUBJECTS = Object.freeze({
  WELCOME: 'Bienvenido a Inventario Aztlan',
  PASSWORD_RESET: 'Recuperación de contraseña',
  PASSWORD_CHANGED: 'Su contraseña fue cambiada',
  ACCOUNT_LOCKED: 'Su cuenta fue bloqueada temporalmente',
});
