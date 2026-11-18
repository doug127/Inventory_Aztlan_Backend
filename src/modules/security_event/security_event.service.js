// HU-110: consulta de la bitácora de seguridad. Solo el SUPERADMIN tiene acceso (lo exige la
// ruta), y ve todos los eventos.
import { AUTH_EVENT_TYPES } from '#src/shared/constants/auth.js';
import * as securityEventRepository from './security_event.repository.js';
import { toSecurityEventDto } from './security_event.dto.js';

const toFilterMeta = ({ userId, username, eventType, ip, from, to }) =>
  Object.fromEntries(
    Object.entries({ userId, username, eventType, ip, from: from?.toISOString(), to: to?.toISOString() }).filter(
      ([, value]) => value !== undefined
    )
  );

export const listSecurityEvents = async (query) => {
  const { items, total } = await securityEventRepository.listSecurityEvents(query);
  return {
    items: items.map(toSecurityEventDto),
    total,
    page: query.page,
    limit: query.limit,
    filters: toFilterMeta(query),
    sort: { field: 'createdAt', order: query.order },
  };
};

/** Tipos de evento para el filtro de la pantalla. */
export const listEventTypes = () => Object.values(AUTH_EVENT_TYPES);
