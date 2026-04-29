import bcrypt from 'bcrypt';
import {
    findAllUsersRepository,
    findUserByIdRepository,
    findUserWithRoleByIdRepository,
    createUserRepository,
    updateUserRepository,
    deleteUserRepository
} from '../repositories/user.js';
import { findRoleByName } from '../repositories/role.js';
import {
    validateUsername,
    validateFullname,
    validatePassword
} from '../dtos/user.js';

export const getAllUsersService = async (currentUser) => {
    const userWithRole = await findUserWithRoleByIdRepository(currentUser.id);

    if (!userWithRole) {
        throw new Error('Usuario no encontrado');
    }

    const currentLevel = userWithRole.role.hierarchy_level;

    const users = await findAllUsersRepository(currentLevel);

    if (!users || users.length === 0) {
        throw new Error('No se encontraron usuarios');
    }

    return users;
}

export const getUserByIdService = async (id) => {
    const user = await findUserByIdRepository(id);
    if (!user) {
        throw new Error('Usuario no encontrado');
    }
    return user;
}

export const createUserService = async ({ data, currentUser }) => {
  let { username, fullname, password, role_id } = data;

  if (!['admin', 'superadmin'].includes(currentUser.role)) {
    throw new Error('No tienes permiso para crear usuarios');
  }

  validateUsername(username);
  validateFullname(fullname);
  validatePassword(password);

  username = username.toLowerCase();
  fullname = fullname.toUpperCase();

  const hashedPassword = await bcrypt.hash(password, 10);

  let finalRoleId;

  if (currentUser.role === 'superadmin') {
    if (!role_id) throw new Error('El rol es obligatorio');
    finalRoleId = role_id;
  }

  if (currentUser.role === 'admin') {
    const userRole = await findRoleByName('user');
    if (!userRole) throw new Error('Rol de usuario no encontrado');
    finalRoleId = userRole.id;
  }

  return createUserRepository({
    username,
    fullname,
    password: hashedPassword,
    role_id: finalRoleId
  });
};

export const updateUserService = async ({ id, data, currentUser }) => {
  try {
    let { username, fullname, password, role_id } = data;

    if (!['admin', 'superadmin'].includes(currentUser.role)) {
      throw new Error('No tienes permiso para actualizar usuarios');
    }

    if (username) {
      validateUsername(username);
      data.username = username.toLowerCase();
    }

    if (fullname) {
      validateFullname(fullname);
      data.fullname = fullname.toUpperCase();
    }

    if (password) {
      validatePassword(password);
      data.password = await bcrypt.hash(password, 10);
    }

    if (currentUser.role  === 'admin' && role_id !== undefined) {
      throw new Error('No tienes permiso para modificar el rol del usuario');
    }

    if (currentUser.role  === 'superadmin') {
      if (role_id === undefined) {
        throw new Error('El rol es obligatorio');
      }
      data.role_id = role_id;
    }

    return await updateUserRepository(id, data);

  } catch (error) {
    throw new Error(error.message);
  }
};

export const deleteUserService = async (id) => {
    try {
        await deleteUserRepository(id);
        return;
    } catch (error) {
        throw new Error('Error al eliminar usuario: ' + error.message);
    }   
}