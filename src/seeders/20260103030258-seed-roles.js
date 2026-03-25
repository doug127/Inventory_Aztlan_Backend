export const up = async (queryInterface, Sequelize) => {
    await queryInterface.bulkInsert('roles', [
        {
            name: 'superadmin',
            description: 'Super Administrator with all privileges',
            createdAt: new Date(),
            updatedAt: new Date()
        },
        {
            name: 'admin',
            description: 'Administrator with full access',
            createdAt: new Date(),
            updatedAt: new Date()
        },
        {
            name: 'user',
            description: 'Regular user with limited access',
            createdAt: new Date(),
            updatedAt: new Date()
        }
    ], {});
}

export const down = async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('roles', null, {});
}