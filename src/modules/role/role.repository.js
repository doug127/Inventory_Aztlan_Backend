import { Role } from '#src/database/models/index.model.js';

export const findRoleByName = async (name) => {
  return await Role.findOne({ where: { name } });
};

export const findRoleById = async (id) => {
  return await Role.findByPk(id);
};