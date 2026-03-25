export const up = async (queryInterface, Sequelize) => {
  const now = new Date();

  const types = [
    'DESECHO',
    'CONSUMO',
    'PRESTAMO',
    'COMPRA',
    'VENTA',
    'TRASLADO',
    'AJUSTE',
    'DONACIÓN',
    'DOTACIÓN',
    'OTRO',
  ];

  const reasons = types.map((type) => ({
    type,
    createdAt: now,
    updatedAt: now,
  }));

  await queryInterface.bulkInsert("reasons", reasons, {});
}

export const down = async (queryInterface, Sequelize) => {
  await queryInterface.bulkDelete("reasons", null, {});
}