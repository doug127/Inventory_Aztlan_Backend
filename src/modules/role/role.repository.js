import { Role } from '#src/database/models/index.model.js';

const plain = (row) => (row ? row.get({ plain: true }) : null);

const ATTRIBUTES = ['id', 'code', 'name', 'description', 'hierarchy', 'isActive'];

export const findRoleByCode = async (code, { transaction } = {}) =>
  plain(await Role.findOne({ where: { code }, attributes: ATTRIBUTES, transaction }));

export const findRoleById = async (id, { transaction } = {}) =>
  plain(await Role.findByPk(id, { attributes: ATTRIBUTES, transaction }));

/** Roles activos ordenados del mayor al menor rango (hierarchy 0 primero). */
export const listActiveRoles = async () =>
  (await Role.findAll({ where: { isActive: true }, attributes: ATTRIBUTES, order: [['hierarchy', 'ASC']] })).map(plain);
