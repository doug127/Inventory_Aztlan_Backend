// Consultas de la gestión de usuarios. No lee passwordHash (eso es exclusivo de auth.repository),
// no valida ni lanza errores de negocio: devuelve objetos planos o null y el service decide.
import { Op, Transaction } from 'sequelize';
import { User, Role } from '#src/database/models/index.model.js';
import { ROLE_CODES } from '#src/shared/constants/roles.js';

const ROLE_ATTRIBUTES = ['id', 'code', 'name', 'hierarchy', 'isActive'];
const roleInclude = (where) => ({ model: Role, as: 'role', attributes: ROLE_ATTRIBUTES, required: true, ...(where && { where }) });

const plain = (row) => (row ? row.get({ plain: true }) : null);

// FOR UPDATE OF "User": bloquea solo la fila del usuario, no la del rol unido.
const lockOption = (lock) => (lock ? { level: Transaction.LOCK.UPDATE, of: User } : undefined);

const SORT_COLUMNS = {
  username: ['username'],
  fullName: ['fullName'],
  email: ['email'],
  role: [{ model: Role, as: 'role' }, 'hierarchy'],
  createdAt: ['createdAt'],
  lastLoginAt: ['lastLoginAt'],
};

export const findUserById = async (id, { transaction, lock = false } = {}) =>
  plain(await User.findByPk(id, { include: [roleInclude()], transaction, lock: lockOption(lock) }));

/**
 * Lista paginada. `minHierarchyExclusive` limita a usuarios de rango inferior al indicado
 * (hierarchy mayor); null no limita (SUPERADMIN).
 */
export const listUsers = async ({ page, limit, search, roleCode, isActive, isLocked, sort, order, minHierarchyExclusive, now = new Date() }) => {
  const where = {};
  if (isActive !== undefined) where.isActive = isActive;
  if (isLocked === true) where.lockedUntil = { [Op.gt]: now };
  if (isLocked === false) where[Op.and] = [{ [Op.or]: [{ lockedUntil: null }, { lockedUntil: { [Op.lte]: now } }] }];
  if (search) {
    const pattern = `%${search.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
    where[Op.or] = [
      { username: { [Op.iLike]: pattern } },
      { fullName: { [Op.iLike]: pattern } },
      { email: { [Op.iLike]: pattern } },
    ];
  }

  const roleWhere = {};
  if (roleCode) roleWhere.code = roleCode;
  if (minHierarchyExclusive !== null && minHierarchyExclusive !== undefined) roleWhere.hierarchy = { [Op.gt]: minHierarchyExclusive };

  const direction = order === 'desc' ? 'DESC' : 'ASC';
  const { rows, count } = await User.findAndCountAll({
    where,
    include: [roleInclude(Object.keys(roleWhere).length ? roleWhere : undefined)],
    order: [[...SORT_COLUMNS[sort], direction], ['id', 'ASC']],
    limit,
    offset: (page - 1) * limit,
    distinct: true,
  });
  return { items: rows.map(plain), total: count };
};

/** Devuelve qué campos únicos ya están ocupados por otro usuario: { username?: true, email?: true }. */
export const findTakenFields = async ({ username, email }, { excludeId, transaction } = {}) => {
  const conditions = [];
  if (username) conditions.push({ username });
  if (email) conditions.push({ email });
  if (!conditions.length) return {};

  const where = { [Op.or]: conditions, ...(excludeId && { id: { [Op.ne]: excludeId } }) };
  const rows = await User.findAll({ where, attributes: ['username', 'email'], transaction });
  return {
    ...(username && rows.some((r) => r.username === username) && { username: true }),
    ...(email && rows.some((r) => r.email === email) && { email: true }),
  };
};

export const createUser = async (data, { transaction } = {}) => plain(await User.create(data, { transaction }));

export const updateUser = async (id, changes, { transaction } = {}) => {
  await User.update(changes, { where: { id }, transaction });
};

/**
 * Cuenta los SUPERADMIN activos. Con lock: true bloquea sus filas (FOR UPDATE) para que dos
 * operaciones simultáneas no dejen el sistema sin superadministrador.
 */
export const countActiveSuperadmins = async ({ transaction, lock = false } = {}) => {
  const rows = await User.findAll({
    where: { isActive: true },
    attributes: ['id'],
    include: [{ model: Role, as: 'role', attributes: [], required: true, where: { code: ROLE_CODES.SUPERADMIN } }],
    transaction,
    lock: lockOption(lock),
  });
  return rows.length;
};
