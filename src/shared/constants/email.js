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

// Asunto de cada plantilla. El cuerpo no se guarda en la BD (db_schema.md §2): lo arma el worker
// de envío (HU-106) a partir de la plantilla, para que ningún enlace con token quede almacenado.
export const EMAIL_SUBJECTS = Object.freeze({
  WELCOME: 'Bienvenido a Inventario Aztlan',
  PASSWORD_RESET: 'Recuperación de contraseña',
  PASSWORD_CHANGED: 'Su contraseña fue cambiada',
  ACCOUNT_LOCKED: 'Su cuenta fue bloqueada temporalmente',
});
