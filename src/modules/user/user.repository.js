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

export const findAllUsersRepository = async (currentLevel) => {
    return await User.findAll({ 
      attributes: { exclude: ['password', 'createdAt', 'updatedAt'] },
      include: {
        model: Role,
        attributes: ['id', 'name', 'hierarchy_level'],
        required: true,
        where: {
            hierarchy_level: {
                [Op.lte]: currentLevel
            }
        }
      } 
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

