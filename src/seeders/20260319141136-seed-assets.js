export const up = async (queryInterface, Sequelize) => {
  const now = new Date();

  const assets_data = [
    {
      name: 'Mitsubishi Canter',
      asset_type_id: 1
    },
    {
      name: 'Jeep',
      asset_type_id: 1
    },
    {
      name: 'JAC',
      asset_type_id: 1 
    },
    {
      name: 'Icaicene',
      asset_type_id: 1
    },
    {
      name: 'Tritón Ford 350',
      asset_type_id: 1
    },
    {
      name: 'Mack Volteo',
      asset_type_id: 1
    },
    {
      name: 'Buseta',
      asset_type_id: 1
    },
    {
      name: 'AVA Leopardo',
      asset_type_id: 2
    },
    {
      name: 'Empire Horse EK',
      asset_type_id: 2
    },
    {
      name: 'Empire Horse',
      asset_type_id: 2
    },
    {
      name: 'TX',
      asset_type_id: 2
    },
    {
      name: 'Caterpillar 320 Jumbo',
      asset_type_id: 3
    },
    {
      name: 'Caterpillar Patrol',
      asset_type_id: 3
    },
    {
      name: 'Personal Administrativo',
      asset_type_id: 4
    },
    {
      name: 'Personal Obrero',
      asset_type_id: 4
    },
    {
      name: 'Personal de campo',
      asset_type_id: 6,
    },
    {
      name: 'Implemento de campo',
      asset_type_id: 6
    },
    {
      name: 'Personal de cosecha',
      asset_type_id: 7
    },
    {
      name: 'Implementos de cosecha',
      asset_type_id: 7
    },
    {
      name: 'Máquina Cosechadora',
      asset_type_id: 7
    },
    {
      name: 'Personal de taller',
      asset_type_id: 8
    },
    {
      name: 'Implementos de taller',
      asset_type_id: 8
    },
    {
      name: 'Massey Ferguson 291',
      asset_type_id: 9
    },
    {
      name: 'Massey Ferguson 299',
      asset_type_id: 9
    },
    {
      name: 'Massey Ferguson 680H',
      asset_type_id: 9
    },
    {
      name: 'Landini Super 190HC',
      asset_type_id: 9
    },
    {
      name: 'Landini Super 100HC',
      asset_type_id: 9
    },
    {
      name: 'Mack Amarillo Chuto',
      asset_type_id: 10
    },
    {
      name: 'Internacional 5000',
      asset_type_id: 10
    },
    {
      name: 'Mack Blanco',
      asset_type_id: 10
    },
    {
      name: 'Mitsubishi Blanco',
      asset_type_id: 10
    },
  ];

  const assets = assets_data.map(asset => ({
    ...asset,
    createdAt: now,
    updatedAt: now
  }));
  
  await queryInterface.bulkInsert('assets', assets, {});
}

export const down = async (queryInterface, Sequelize) => {
  await queryInterface.bulkDelete('assets', null, {});
}
