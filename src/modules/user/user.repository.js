import { User, Role } from '#src/database/models/index.model.js';
import { Op } from 'sequelize';

export const findUserByUsername = (username) => {
  return User.findOne({
    where: { username, is_active: true },
    include: {
      model: Role,
      attributes: ['id', 'name', 'hierarchy_level' ,'description']
    }
  });
};

export const findUserWithRoleByIdRepository = async (id) => {
    return await User.findByPk(id, {
        include: {
            model: Role
        }
    });
};

export const findAllUsersRepository = async ({
  filters = {},
  currentLevel,
  limit,
  offset,
  order = 'ASC',
  includeInactive = false
}) => {
  const where = includeInactive ? {} : { is_active: true };

  if (filters.fullname) where.fullname = { [Op.iLike]: `%${filters.fullname}%` };
  if (filters.username) where.username = { [Op.iLike]: `%${filters.username}%` };

  const roleWhere = {
    hierarchy_level: {
      [Op.lte]: currentLevel
    }
  };

  if (filters.role) roleWhere.name = { [Op.iLike]: `%${filters.role}%` };

  return await User.findAndCountAll({
    where,
    attributes: { exclude: ['password', 'createdAt', 'updatedAt'] },
    include: {
      model: Role,
      attributes: ['id', 'name', 'hierarchy_level'],
      required: true,
      where: roleWhere
    },
    limit,
    offset,
    distinct: true,
    order: [['fullname', order]]
  });
};

export const findUserByIdRepository = async (id) => {
    return await User.findByPk(id, {
      attributes: { exclude: ['password'] },
      include: {
        model: Role
      }
    });
};

export const createUserRepository = async (userData) => {
    return await User.create(userData);
}

export const updateUserRepository = async (id, updates) => {
    const user = await User.findByPk(id);
    if (!user) {
        throw new Error('Usuario no encontrado');
    }
    return await user.update(updates);
}

export const deleteUserRepository = async (id) => {
    const user = await User.findByPk(id);
    if (!user) {
        throw new Error('Usuario no encontrado');
    }
    return await user.destroy();
}

