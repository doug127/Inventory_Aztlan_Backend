export const up = async (queryInterface, Sequelize) => {
  const now = new Date();

  const asset_types_data = [
    {
      name: 'Vehículo',
      description: 'Abarca todos los vehiculos'
    },
    {
      name: 'Moto',
      description: 'Abarca todas las motos de la finca y personal'
    },
    {
      name: 'Maquinaria',
      description: 'Abarca toda la maquinaria como Jumbo y/o Patrol'
    },
    {
      name: 'Personal',
      description: 'Abarca todo lo que pueda utilizar o equipar el personal operativo y/o administrativo'
    },
    {
      name: 'Implemento',
      description: 'Abarca implementos de trabajo como palas, picos, rastrillos, etc.'
    },
    {
      name: 'Campo',
      description: 'Abarca todas las labores de campo, como el uso de quimicos, fertilizantes, combustibles y/o implementos'
    },
    {
      name: 'Cosecha',
      description: 'Abarca todas las labores de cosecha como el personal y combustibles consumidos'
    },
    {
      name: 'Taller',
      description: 'Abarca todas las labores del taller, como reparación de maquinaría, vehículos y dotación de equipos al personal'
    },
    {
      name: 'Tractor',
      description: 'Abarca todo lo referente a los tractores de la finca'
    },
    {
      name: 'Camión',
      description: 'Abarca todo lo referente a los camiones de la finca'
    },
  ];

  const asset_types = asset_types_data.map(asset => ({
    ...asset,
    createdAt: now,
    updatedAt: now
  }));

  await queryInterface.bulkInsert('asset_types', asset_types, {});
};

export const down = async (queryInterface, Sequelize) => {
  await queryInterface.bulkDelete('asset_types', null, {});
};
