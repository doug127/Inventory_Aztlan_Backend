// Logger de una línea con columnas fijas:  TIPO CONTEXTO DESTINO ESTADO clave=valor ... ts=ISO8601
// Ver .claude/references/logging.md. Es el único lugar de la app que escribe en consola.
const LEVELS = { DEBUG: 10, INFO: 20, WARN: 30, ERROR: 40, SILENT: 100 };

const resolveThreshold = () =>
  LEVELS[(process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'test' ? 'silent' : 'info')).toUpperCase()] ??
  LEVELS.INFO;

const SENSITIVE_KEY = /pass|token|secret|authorization|cookie|hash/i;

const formatValue = (value) => {
  if (value === undefined || value === null || value === '') return '-';
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[\s"=]/.test(text) ? JSON.stringify(text) : text;
};

export const formatInfo = (info = {}) =>
  Object.entries(info)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${SENSITIVE_KEY.test(key) ? '[REDACTED]' : formatValue(value)}`)
    .join(' ');

const write = (level, context, target, status, info, stack) => {
  if (LEVELS[level] < resolveThreshold()) return;
  const line = [
    level.padEnd(5),
    context,
    target,
    status ?? '-',
    formatInfo({ ...info, ts: new Date().toISOString() }),
  ].join(' ');
  const stream = LEVELS[level] >= LEVELS.WARN ? process.stderr : process.stdout;
  stream.write(`${line}\n`);
  if (stack) stream.write(`${stack}\n`);
};

export const logger = {
  debug: (context, target, status, info) => write('DEBUG', context, target, status, info),
  info: (context, target, status, info) => write('INFO', context, target, status, info),
  warn: (context, target, status, info) => write('WARN', context, target, status, info),
  error: (context, target, status, info, stack) => write('ERROR', context, target, status, info, stack),
};

export const maskEmail = (email) => email?.replace(/^(.).*(@.*)$/, '$1***$2');
