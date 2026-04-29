export const up = async (queryInterface, Sequelize) => {
  const now = new Date();

  await queryInterface.bulkInsert('units', [
    {
      name: 'Kilogramo',
      code: 'Kg',
      base_unit_id: null,
      conversion_factor: 1,
      is_active: true,
      createdAt: now,
      updatedAt: now
    },
    {
      name: 'Litro',
      code: 'l',
      base_unit_id: null,
      conversion_factor: 1,
      is_active: true,
      createdAt: now,
      updatedAt: now
    },
    {
      name: 'Unidad',
      code: 'ud',
      base_unit_id: null,
      conversion_factor: 1,
      is_active: true,
      createdAt: now,
      updatedAt: now
    }
  ], {returning: true});

  const [bases] = await queryInterface.sequelize.query(` 
    SELECT id, code FROM units 
    WHERE base_unit_id IS NULL 
  `);

  const baseMap = {};
  bases.forEach(unit => {
    baseMap[unit.code] = unit.id;
  });

  await queryInterface.bulkInsert('units', [
    {
      name: 'Gramo',
      code: 'g',
      base_unit_id: baseMap.kg,
      conversion_factor: 0.001,
      is_active: true,
      createdAt: now,
      updatedAt: now
    },
    {
      name: 'Miligramo',
      code: 'mg',
      base_unit_id: baseMap.kg,
      conversion_factor: 0.000001,
      is_active: true,
      createdAt: now,
      updatedAt: now
    },
    {
      name: 'Mililitro',
      code: 'ml',
      base_unit_id: baseMap.l,
      conversion_factor: 0.001,
      is_active: true,
      createdAt: now,
      updatedAt: now
    },
    {
      name: 'Docena',
      code: 'dz',
      base_unit_id: baseMap.ud,
      conversion_factor: 12,
      is_active: true,
      createdAt: now,
      updatedAt: now
    }
  ]);
};

export const down = async (queryInterface, Sequelize) => {
  await queryInterface.bulkDelete('units', null, {});
}