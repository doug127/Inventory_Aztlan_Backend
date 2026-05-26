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
      code: 'L',
      base_unit_id: null,
      conversion_factor: 1,
      is_active: true,
      createdAt: now,
      updatedAt: now
    },
    {
      name: 'Unidad',
      code: 'und',
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
      base_unit_id: baseMap.Kg,
      conversion_factor: 0.001,
      is_active: true,
      createdAt: now,
      updatedAt: now
    },
    {
      name: 'Miligramo',
      code: 'mg',
      base_unit_id: baseMap.Kg,
      conversion_factor: 0.000001,
      is_active: true,
      createdAt: now,
      updatedAt: now
    },
    {
      name: 'Mililitro',
      code: 'ml',
      base_unit_id: baseMap.L,
      conversion_factor: 0.001,
      is_active: true,
      createdAt: now,
      updatedAt: now
    },
    {
      name: 'Docena',
      code: 'dz',
      base_unit_id: baseMap.und,
      conversion_factor: 12,
      is_active: true,
      createdAt: now,
      updatedAt: now
    },
    {
      name: 'Par',
      code: 'pr',
      base_unit_id: baseMap.und,
      conversion_factor: 2,
      is_active: true,  
      createdAt: now,
      updatedAt: now
    },
    {
      name: 'Sacos',
      code: 'sac',
      base_unit_id: baseMap.Kg,
      conversion_factor: 50,
      is_active: true,
      createdAt: now,
      updatedAt: now  
    },
    {
      name: 'Porrón',
      code: 'prr',
      base_unit_id: baseMap.L,
      conversion_factor: 208,
      is_active: true,
      createdAt: now,
      updatedAt: now
    },
    {
      name: 'Sobre 200g',
      code: 's200g',
      base_unit_id: baseMap.Kg,
      conversion_factor: 0.2,
      is_active: true,
      createdAt: now,
      updatedAt: now  
    }, 
    {
      name: "Sobre 100g",
      code: "s100g",
      base_unit_id: baseMap.Kg,
      conversion_factor: 0.1,
      is_active: true,
      createdAt: now,
      updatedAt: now
    }
  ]);
};

export const down = async (queryInterface, Sequelize) => {
  await queryInterface.bulkDelete('units', null, {});
}