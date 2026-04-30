import bcrypt from 'bcrypt';

export const up = async (queryInterface, Sequelize) => {
  const roles = await queryInterface.select(null, 'roles', {
    where: {
      name: ['admin', 'user', 'superadmin']
    }

  });
  const superadminRole = roles.find(r => r.name === 'superadmin');
  const adminRole = roles.find(r => r.name === 'admin');
  const userRole  = roles.find(r => r.name === 'user');

  if (!superadminRole || !adminRole || !userRole) {
    throw new Error('Roles requeridos no existen');
  }

  const passwordHash = await bcrypt.hash('SNKs405.', 10);

  await queryInterface.bulkInsert('users', [
    {
      fullname: 'Super Admin',
      username: 'superadmin',
      password: passwordHash,
      role_id: superadminRole.id,
      is_active: true,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      fullname: 'Admin User',
      username: 'admin',
      password: passwordHash,
      role_id: adminRole.id,
      is_active: true,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      fullname: 'Regular User',
      username: 'user',
      password: passwordHash,
      role_id: userRole.id,
      is_active: true,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ], {});
};

export const down = async (queryInterface, Sequelize) => {
  await queryInterface.bulkDelete('users', {
    username: { [Sequelize.Op.in]: ['admin', 'user'] }
  }, {});
};