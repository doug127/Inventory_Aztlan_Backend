// Fuente única de los valores de auth (deben coincidir con auth_event_type_enum de la migración).
export const AUTH_EVENT_TYPES = Object.freeze({
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILED: 'LOGIN_FAILED',
  LOGOUT: 'LOGOUT',
  TOKEN_REFRESHED: 'TOKEN_REFRESHED',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  ACCOUNT_UNLOCKED: 'ACCOUNT_UNLOCKED',
  PASSWORD_RESET_REQUESTED: 'PASSWORD_RESET_REQUESTED',
  PASSWORD_RESET_COMPLETED: 'PASSWORD_RESET_COMPLETED',
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
});

// business_rules.md §9.3: el access token vive 15 minutos.
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

// business_rules.md §9.3: el refresh token vive 7 días y rota en cada uso.
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const REFRESH_COOKIE_NAME = 'refreshToken';
// La cookie solo viaja a las rutas de auth, no a todo el API.
export const REFRESH_COOKIE_PATH = '/api/auth';

// business_rules.md §9.4: 5 intentos fallidos consecutivos bloquean la cuenta 15 minutos.
export const MAX_FAILED_LOGIN_ATTEMPTS = 5;
export const ACCOUNT_LOCK_MS = 15 * 60 * 1000;

// auth.md §7: límite de intentos de login por IP, contra ataques que prueban muchos usuarios.
export const LOGIN_RATE_LIMIT_WINDOW_MS = 60 * 1000;
export const LOGIN_RATE_LIMIT_DEFAULT = 10;

// business_rules.md §9.2: bcrypt con costo >= 10.
export const BCRYPT_COST = 12;
