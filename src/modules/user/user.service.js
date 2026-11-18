// Gestión de usuarios (HU-107) y soporte de cuentas (HU-108).
//
// Reglas de jerarquía (business_rules.md §8.3). hierarchy 0 = mayor rango.
//  1. Solo se gestiona a usuarios de rango inferior (hierarchy mayor). SUPERADMIN gestiona a todos.
//  2. Solo se asignan roles de rango inferior al propio, salvo SUPERADMIN.
//  3. Nadie cambia su propio rol ni se desactiva a sí mismo.
//  4. Siempre queda al menos un SUPERADMIN activo.
// La ruta exige ADMIN como mínimo (control grueso); aquí se valida contra cada usuario destino.
//
// `actor` es el usuario de la sesión (req.user): { id, username, roleCode, hierarchy }.
import { AppError } from '#src/shared/errors/AppError.js';
import { withTransaction } from '#src/shared/db/transaction.js';
import { ROLE_CODES } from '#src/shared/constants/roles.js';
import { EMAIL_TEMPLATES } from '#src/shared/constants/email.js';
import * as emailService from '#src/modules/email/email.service.js';
import * as authService from '#src/modules/auth/auth.service.js';
import * as roleRepository from '#src/modules/role/role.repository.js';
import * as userRepository from './user.repository.js';
import { toRoleDto, toUserDto } from './user.dto.js';

const isSuperadmin = (actor) => actor.roleCode === ROLE_CODES.SUPERADMIN;

/** Regla 1 y 2: el actor está por encima de ese rango (o es SUPERADMIN). */
const outranks = (actor, hierarchy) => isSuperadmin(actor) || hierarchy > actor.hierarchy;

const fieldIssue = (path, message) => ({ location: 'body', path, message });

const hierarchyError = (message) => new AppError('FORBIDDEN_HIERARCHY', message ? { message } : undefined);

const findUserOrFail = async (id, options) => {
  const user = await userRepository.findUserById(id, options);
  if (!user) throw new AppError('NOT_FOUND', { message: `Usuario ${id} no encontrado` });
  return user;
};

/** Carga al usuario destino y verifica que el actor puede gestionarlo (regla 1). */
const findManageableUser = async (actor, id) => {
  const user = await findUserOrFail(id);
  if (user.id !== actor.id && !outranks(actor, user.role.hierarchy)) throw hierarchyError();
  return user;
};

/** Rol a asignar: debe existir, estar activo y ser de rango inferior al del actor (regla 2). */
const resolveAssignableRole = async (actor, roleCode) => {
  const role = await roleRepository.findRoleByCode(roleCode);
  if (!role) {
    throw new AppError('VALIDATION_ERROR', { details: [fieldIssue('roleCode', `El rol ${roleCode} no existe`)] });
  }
  if (!role.isActive) throw new AppError('INACTIVE_RESOURCE', { message: `El rol ${role.code} está desactivado` });
  if (!outranks(actor, role.hierarchy)) {
    throw hierarchyError('No puede asignar un rol de rango igual o superior al suyo');
  }
  return role;
};

/** Username y correo deben ser únicos. Se verifica antes para responder por campo; el UNIQUE cubre las carreras. */
const assertUniqueFields = async ({ username, email }, { excludeId } = {}) => {
  const taken = await userRepository.findTakenFields({ username, email }, { excludeId });
  const details = [];
  if (taken.username) details.push(fieldIssue('username', 'El nombre de usuario ya existe'));
  if (taken.email) details.push(fieldIssue('email', 'El correo ya está registrado'));
  if (details.length) throw new AppError('DUPLICATE_CODE', { message: details.map((d) => d.message).join('. '), details });
};

/**
 * Regla 4: si el usuario es un SUPERADMIN activo, debe quedar al menos otro. Con transacción
 * bloquea las filas de los SUPERADMIN para que dos operaciones simultáneas no pasen ambas.
 */
const assertNotLastSuperadmin = async (user, { transaction } = {}) => {
  if (user.role.code !== ROLE_CODES.SUPERADMIN || !user.isActive) return;
  const active = await userRepository.countActiveSuperadmins({ transaction, lock: Boolean(transaction) });
  if (active <= 1) throw new AppError('LAST_SUPERADMIN');
};

// --- Consultas ---------------------------------------------------------------

/** Usuarios que el actor puede gestionar, paginados y filtrados. */
export const listUsers = async (actor, query) => {
  const { page, limit, search, sort, order, ...filters } = query;
  const { items, total } = await userRepository.listUsers({
    ...query,
    minHierarchyExclusive: isSuperadmin(actor) ? null : actor.hierarchy,
  });
  const now = new Date();
  return {
    items: items.map((user) => toUserDto(user, now)),
    total,
    page,
    limit,
    search: search ?? null,
    filters: Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== undefined)),
    sort: { field: sort, order },
  };
};

export const getUser = async (actor, id) => toUserDto(await findManageableUser(actor, id));

/** Roles que el actor puede asignar al crear o editar (para el selector de la pantalla). */
export const listAssignableRoles = async (actor) =>
  (await roleRepository.listActiveRoles()).filter((role) => outranks(actor, role.hierarchy)).map(toRoleDto);

// --- Alta, edición y estado (HU-107) -----------------------------------------

/**
 * Alta de usuario (business_rules.md §9.1). No hay autorregistro ni contraseña en la petición:
 * el usuario nace con una contraseña desconocida y must_change_password = true, y la contraseña
 * temporal se genera al enviar el correo WELCOME (prepareWelcomeForDelivery), así no queda en la
 * BD ni en la respuesta.
 */
export const createUser = async (actor, { username, fullName, email, roleCode }) => {
  const role = await resolveAssignableRole(actor, roleCode);
  await assertUniqueFields({ username, email });
  const passwordHash = await authService.unusablePasswordHash();

  const user = await withTransaction(async (transaction) => {
    const created = await userRepository.createUser(
      { username, fullName, email, roleId: role.id, passwordHash, mustChangePassword: true },
      { transaction }
    );
    await emailService.enqueueEmail(
      { userId: created.id, toEmail: email, template: EMAIL_TEMPLATES.WELCOME },
      { transaction }
    );
    return userRepository.findUserById(created.id, { transaction });
  });

  return toUserDto(user);
};

/**
 * Edición de nombre, correo, username o rol. Un ADMIN no se edita a sí mismo (rango igual); el
 * SUPERADMIN sí puede editar sus datos, pero nadie cambia su propio rol.
 * Un cambio de rol tiene efecto en la siguiente petición del usuario: el middleware auth lee el
 * rol de la BD en cada petición.
 */
export const updateUser = async (actor, id, changes) => {
  const target = await findUserOrFail(id);
  const isSelf = target.id === actor.id;
  if (!outranks(actor, target.role.hierarchy)) throw hierarchyError();

  const roleChanges = changes.roleCode !== undefined && changes.roleCode !== target.role.code;
  let role = null;
  if (roleChanges) {
    if (isSelf) {
      await assertNotLastSuperadmin(target);
      throw hierarchyError('No puede cambiar su propio rol');
    }
    role = await resolveAssignableRole(actor, changes.roleCode);
  }

  const update = {};
  for (const field of ['username', 'fullName', 'email']) {
    if (changes[field] !== undefined && changes[field] !== target[field]) update[field] = changes[field];
  }
  if (role) update.roleId = role.id;
  if (!Object.keys(update).length) return toUserDto(target);

  await assertUniqueFields({ username: update.username, email: update.email }, { excludeId: target.id });

  const user = await withTransaction(async (transaction) => {
    const locked = await findUserOrFail(target.id, { transaction, lock: true });
    if (role) await assertNotLastSuperadmin(locked, { transaction });
    await userRepository.updateUser(target.id, update, { transaction });
    return userRepository.findUserById(target.id, { transaction });
  });

  return toUserDto(user);
};

/**
 * Desactivación: el usuario pierde el acceso de inmediato. Se revocan sus sesiones y su enlace de
 * recuperación, y el middleware auth rechaza sus access tokens en la siguiente petición.
 * Desactivar a alguien ya inactivo no hace nada (idempotente).
 */
export const deactivateUser = async (actor, id) => {
  const target = await findUserOrFail(id);
  if (target.id === actor.id) {
    // Al único SUPERADMIN se le responde LAST_SUPERADMIN (criterio del Módulo 3), aunque sea él mismo.
    await assertNotLastSuperadmin(target);
    throw hierarchyError('No puede desactivarse a sí mismo');
  }
  if (!outranks(actor, target.role.hierarchy)) throw hierarchyError();
  if (!target.isActive) return toUserDto(target);

  const user = await withTransaction(async (transaction) => {
    const locked = await findUserOrFail(target.id, { transaction, lock: true });
    await assertNotLastSuperadmin(locked, { transaction });
    await userRepository.updateUser(target.id, { isActive: false }, { transaction });
    await authService.revokeAccountAccess(target.id, { transaction });
    return userRepository.findUserById(target.id, { transaction });
  });

  return toUserDto(user);
};

/** Reactivación. Si el usuario no había hecho su primer ingreso, conserva must_change_password. */
export const activateUser = async (actor, id) => {
  const target = await findManageableUser(actor, id);
  if (target.isActive) return toUserDto(target);

  await userRepository.updateUser(target.id, { isActive: true });
  return toUserDto(await findUserOrFail(target.id));
};

// --- Soporte de cuentas (HU-108) ---------------------------------------------

/** Desbloqueo manual (business_rules.md §9.4.3). Si la cuenta no estaba bloqueada no registra evento. */
export const unlockUser = async (actor, id, context = {}) => {
  const target = await findManageableUser(actor, id);
  const result = await authService.unlockAccount(target.id, context);
  if (!result) throw new AppError('NOT_FOUND', { message: `Usuario ${id} no encontrado` });

  return { user: toUserDto(await findUserOrFail(target.id)), wasLocked: result.wasLocked };
};

/**
 * Restablecimiento forzado: anula la contraseña actual, cierra todas las sesiones y envía al
 * usuario el correo PASSWORD_RESET para que fije una nueva (flujo de HU-105). Para su propia
 * contraseña el actor usa POST /api/auth/change-password.
 */
export const forcePasswordReset = async (actor, id, context = {}) => {
  const target = await findUserOrFail(id);
  if (target.id === actor.id) {
    throw hierarchyError('Para cambiar su propia contraseña use POST /api/auth/change-password');
  }
  if (!outranks(actor, target.role.hierarchy)) throw hierarchyError();
  if (!target.isActive) throw new AppError('INACTIVE_RESOURCE', { message: 'El usuario está desactivado' });

  const result = await authService.forcePasswordReset(target.id, context);
  if (!result) throw new AppError('INACTIVE_RESOURCE', { message: 'El usuario está desactivado' });

  return { user: toUserDto(await findUserOrFail(target.id)), revokedSessions: result.revokedSessions };
};

/**
 * [Cerrar sesiones] (user_flow.md §12): revoca todos los refresh tokens del usuario. Cada
 * dispositivo pierde la sesión al vencer su access token (máximo 15 minutos). Para las propias,
 * el actor usa DELETE /api/auth/sessions.
 */
export const revokeUserSessions = async (actor, id, context = {}) => {
  const target = await findUserOrFail(id);
  if (target.id === actor.id) {
    throw hierarchyError('Para cerrar sus propias sesiones use DELETE /api/auth/sessions');
  }
  if (!outranks(actor, target.role.hierarchy)) throw hierarchyError();

  const result = await authService.revokeAllSessions(target.id, context);
  if (!result) throw new AppError('NOT_FOUND', { message: `Usuario ${id} no encontrado` });
  return { user: toUserDto(target), revokedSessions: result.revokedSessions };
};

/** Sesiones activas de un usuario (dispositivo, IP y última actividad), para su ficha. */
export const listUserSessions = async (actor, id) => {
  const target = await findManageableUser(actor, id);
  return authService.listUserSessions(target.id);
};
