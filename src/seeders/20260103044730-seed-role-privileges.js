import { level_hierarchy } from '../utils/level_hierarchy.js';

export const up = async (queryInterface, Sequelize) => {
  // 1️⃣ Obtener roles existentes
  const roles = await queryInterface.sequelize.query(
    `SELECT * FROM roles WHERE name IN ('superadmin', 'admin', 'user')`,
    { type: queryInterface.sequelize.QueryTypes.SELECT }
  );

  const superadminRole = roles.find(r => r.name === 'superadmin');
  const adminRole = roles.find(r => r.name === 'admin');
  const userRole = roles.find(r => r.name === 'user');

  if (!superadminRole || !adminRole || !userRole) {
    throw new Error('Faltan roles en la base de datos');
  }

  // 2️⃣ Obtener todos los privilegios
  const privileges = await queryInterface.sequelize.query(
    `SELECT * FROM privileges`,
    { type: queryInterface.sequelize.QueryTypes.SELECT }
  );

  if (!privileges || privileges.length === 0) {
    throw new Error('No hay privilegios en la base de datos');
  }

  const lh = level_hierarchy;

  // 3️⃣ Crear relaciones para superadmin (todos los privilegios)
  const superadminRolePrivileges = privileges.map(privilege => ({
    role_id: superadminRole.id,
    privilege_id: privilege.id,
    createdAt: new Date(),
    updatedAt: new Date()
  }));

  // 4️⃣ Crear relaciones para admin (privilegios con hierarchy <= ADMIN)
  const adminRolePrivileges = privileges
    .filter(p => p.hierarchy <= lh.ADMIN)
    .map(privilege => ({
      role_id: adminRole.id,
      privilege_id: privilege.id,
      createdAt: new Date(),
      updatedAt: new Date()
    }));

  // 5️⃣ Crear relaciones para user (privilegios con hierarchy <= USER)
  const userRolePrivileges = privileges
    .filter(p => p.hierarchy <= lh.USER)
    .map(privilege => ({
      role_id: userRole.id,
      privilege_id: privilege.id,
      createdAt: new Date(),
      updatedAt: new Date()
    }));

  // 6️⃣ Insertar todo en role_privileges
  await queryInterface.bulkInsert(
    'role_privileges',
    [
      ...superadminRolePrivileges,
      ...adminRolePrivileges,
      ...userRolePrivileges
    ],
    {}
  );
};

export const down = async (queryInterface, Sequelize) => {
  await queryInterface.bulkDelete('role_privileges', null, {});
};
