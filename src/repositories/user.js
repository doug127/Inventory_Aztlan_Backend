import { User, Role, Privilege } from '../models/index.js';

export const findUserByUsername = (username) => {
  return User.findOne({
    where: { username, is_active: true },
    include: {
      model: Role,
      include: Privilege
    }
  });
};

export const findAllUsersRepository = async () => {
    return await User.findAll({ 
      include: {
        model: Role,
        include: Privilege
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

