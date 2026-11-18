// HU-110: consulta de la bitácora de seguridad (business_rules.md §8.2: ADMIN y SUPERADMIN).
//
// Visibilidad, coherente con la gestión de usuarios (§8.3): el SUPERADMIN ve todo; un ADMIN ve
// sus propios eventos, los de usuarios de rango inferior y los intentos con nombres de usuario
// que no existen (user_id NULL), que son justamente los que delatan ataques de fuerza bruta.
import { ROLE_CODES } from '#src/shared/constants/roles.js';
import { AUTH_EVENT_TYPES } from '#src/shared/constants/auth.js';
import * as securityEventRepository from './security_event.repository.js';
import { toSecurityEventDto } from './security_event.dto.js';

const visibilityFor = (actor) =>
  actor.roleCode === ROLE_CODES.SUPERADMIN ? null : { selfId: actor.id, minHierarchyExclusive: actor.hierarchy };

const toFilterMeta = ({ userId, username, eventType, ip, from, to }) =>
  Object.fromEntries(
    Object.entries({ userId, username, eventType, ip, from: from?.toISOString(), to: to?.toISOString() }).filter(
      ([, value]) => value !== undefined
    )
  );

export const listSecurityEvents = async (actor, query) => {
  const { items, total } = await securityEventRepository.listSecurityEvents({ ...query, visibility: visibilityFor(actor) });
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
