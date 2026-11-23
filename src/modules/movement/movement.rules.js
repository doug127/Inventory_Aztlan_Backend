// Reglas comunes a todos los movimientos (business_rules.md §3 y §4). Las usan la orden de retiro
// (HU-401) y, en el Sprint 6, las entradas, traslados y ajustes.
import Decimal from 'decimal.js';
import { AppError } from '#src/shared/errors/AppError.js';
import { ROLE_HIERARCHY } from '#src/shared/constants/roles.js';
import { BACKDATE_DAYS_ALMACENISTA } from '#src/shared/constants/movements.js';

export const QUANTITY_DECIMALS = 3; // NUMERIC(14,3)

// Margen para la diferencia de reloj entre el navegador y el servidor.
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

const fieldIssue = (path, message) => ({ location: 'body', path, message });

/** Inicio del día de hace `days` días, en la hora del servidor. */
const startOfDayAgo = (now, days) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - days);

/**
 * Fecha del movimiento (§4). Sin fecha, ahora.
 *  1. No puede estar en el futuro.
 *  2. ALMACENISTA: hasta 3 días de atraso (desde el inicio del día de hace 3 días).
 *  3. ADMIN y SUPERADMIN: sin límite, pero con más de 3 días de atraso la observación es obligatoria.
 */
export const resolveMovementDate = ({ movementDate, note }, actor, now = new Date()) => {
  const date = movementDate ?? now;
  if (date.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) {
    throw new AppError('MOVEMENT_DATE_INVALID', {
      message: 'La fecha del movimiento no puede estar en el futuro',
      details: [fieldIssue('movementDate', 'La fecha no puede estar en el futuro')],
    });
  }
  const limit = startOfDayAgo(now, BACKDATE_DAYS_ALMACENISTA);
  if (date < limit) {
    if (actor.hierarchy > ROLE_HIERARCHY.ADMIN) {
      throw new AppError('MOVEMENT_DATE_INVALID', {
        message: `Solo se pueden registrar movimientos con hasta ${BACKDATE_DAYS_ALMACENISTA} días de atraso. Para una fecha anterior, pídaselo a un administrador.`,
        details: [fieldIssue('movementDate', `Hasta ${BACKDATE_DAYS_ALMACENISTA} días de atraso`)],
      });
    }
    if (!note) {
      const message = `Con más de ${BACKDATE_DAYS_ALMACENISTA} días de atraso, explique en la observación por qué se registra tarde`;
      throw new AppError('VALIDATION_ERROR', { message, details: [fieldIssue('note', message)] });
    }
  }
  return date;
};

/**
 * §3 regla 4: no se repite (producto, activo) en un movimiento; si llega repetido se suma. Conserva
 * el orden de la primera aparición y la primera observación no vacía. `sources` indica qué líneas
 * de la solicitud (base 1) forman cada línea consolidada.
 */
export const consolidateLines = (lines) => {
  const byKey = new Map();
  lines.forEach((line, index) => {
    const key = `${line.productId}|${line.assetId ?? ''}`;
    const current = byKey.get(key);
    if (current) {
      current.quantity = current.quantity.plus(line.quantity);
      current.note ??= line.note ?? null;
      current.sources.push(index + 1);
    } else {
      byKey.set(key, { productId: line.productId, assetId: line.assetId ?? null, quantity: new Decimal(line.quantity), note: line.note ?? null, sources: [index + 1] });
    }
  });
  return [...byKey.values()];
};

/** Cantidad total por producto sumando todas sus líneas (§2.3 regla 2: 200 L para T-01 + 150 L para T-02). */
export const requiredByProduct = (lines) => {
  const required = new Map();
  for (const line of lines) required.set(line.productId, (required.get(line.productId) ?? new Decimal(0)).plus(line.quantity));
  return required;
};

export const sortedIds = (ids) => [...new Set(ids)].sort((a, b) => a - b);
