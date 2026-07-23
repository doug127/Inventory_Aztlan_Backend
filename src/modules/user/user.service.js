import bcrypt from 'bcrypt';
import {
    findAllUsersRepository,
    findUserByIdRepository,
    findUserWithRoleByIdRepository,
    createUserRepository,
    updateUserRepository,
    deleteUserRepository
} from './user.repository.js';
import { findRoleByName } from '../role/role.repository.js';
import { userResponseDTO } from './user.dto.js';
import { shouldIncludeInactive } from '#src/shared/utils/hierarchyLevel.js'

export const getAllUsersService = async (query, currentUser = {}) => {
  query = query || {};
    const filters = {}

  if (query.fullname) filters.fullname = query.fullname.trim();
  if (query.username) filters.username = query.username.trim();
  if (query.role) filters.role = query.role.trim();

  const order = query.order === 'DESC' ? 'DESC' : 'ASC';
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 10;

    if (page < 1) throw new Error( 'El número de página debe ser mayor o igual a 1' );

    if (limit < 1) throw new Error( 'El límite debe ser mayor o igual a 1' );

    const offset = (page - 1) * limit;

    const userWithRole = await findUserWithRoleByIdRepository(currentUser.id);

    if (!userWithRole) {
        throw new Error('Usuario no encontrado');
    }

    const currentLevel = userWithRole.role.hierarchy_level;

    const includeInactive = shouldIncludeInactive(currentUser);
    const { rows, count } = await findAllUsersRepository({
      filters,
      currentLevel,
      limit,
      offset,
      order,
      includeInactive
    });

    const payload = rows.map(user => userResponseDTO(user));

    return {
      data: payload,
      meta: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit),
        hasNextPage: page < Math.ceil(count / limit),
        hasPreviousPage: page > 1
      }
    };
}

export const getUserByIdService = async (id) => {
    const user = await findUserByIdRepository(id);
    if (!user) {
        throw new Error('Usuario no encontrado');
    }

    const payload = userResponseDTO(user);
    return payload;
}

export const createUserService = async ({ data, currentUser }) => {
  let { username, fullname, password, role_id } = data;

  if (!['admin', 'superadmin'].includes(currentUser.role)) {
    throw new Error('No tienes permiso para crear usuarios');
  }

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

  const user = await createUserRepository({
    username,
    fullname,
    password: hashedPassword,
    role_id: finalRoleId
  });

  return userResponseDTO(user);
};

export const updateUserService = async ({ id, data, currentUser }) => {
  try {
    let { username, fullname, password, role_id } = data;

    if (!['admin', 'superadmin'].includes(currentUser.role)) {
      throw new Error('No tienes permiso para actualizar usuarios');
    }

    if (username) {
      data.username = username.toLowerCase();
    }

    if (fullname) {
      data.fullname = fullname.toUpperCase();
    }

    if (password) {
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

    const user = await updateUserRepository(id, data);

    return userResponseDTO(user);
    
  } catch (error) {
    throw new Error(error.message);
  }
};

export const deleteUserService = async (id, userId) => {
    try {
        if (parseInt(id) === userId) {
            throw new Error('No puedes eliminar tu propio usuario');
        }
        if (userId !== 'superadmin') {
            throw new Error('No tienes permiso para eliminar usuarios');
        }
        await deleteUserRepository(id);
        return;
    } catch (error) {
        throw new Error('Error al eliminar usuario: ' + error.message);
    }   
}