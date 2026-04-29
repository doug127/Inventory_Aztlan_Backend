export const up = async (queryInterface, Sequelize) => {
    const now = new Date();
  
    const movements = [
        {
          movement_type_id: 2,
          reason_id: 2,
          reference: 'Salida para consumo interno',
          datetime: now,
          created_by_user_id: 1,
          warehouse_from_id: 1,
          warehouse_to_id: null,
          note: 'Salida de productos para consumo interno',
          createdAt: now,
          updatedAt: now
        },
        {
          movement_type_id: 1,
          reason_id: 4,
          reference: 'Entrada por compra de repuesto',
          datetime: now,
          created_by_user_id: 1,
          warehouse_from_id: null,
          warehouse_to_id: 1,
          note: 'Entrada de productos por compra de repuesto',
          createdAt: now,
          updatedAt: now
        },
        {
          movement_type_id: 3,
          reason_id: 10,
          reference: 'Transferencia entre almacenes',
          datetime: now,
          created_by_user_id: 1,
          warehouse_from_id: 1,
          warehouse_to_id: 2,
          note: 'Transferencia de productos entre almacenes',
          createdAt: now,
          updatedAt: now
        },
        {
          movement_type_id: 4,
          reason_id: 1,
          reference: 'Ajuste por productos dañados',
          datetime: now,
          created_by_user_id: 1,
          warehouse_from_id: 1,
          warehouse_to_id: null,
          note: 'Ajuste por productos dañados',
          createdAt: now,
          updatedAt: now
        }
    ]
  
    await queryInterface.bulkInsert('movement_headers', movements, {});
};

export const down = async (queryInterface, Sequelize) => {
  await queryInterface.bulkDelete('movement_headers', null, {});
}; 
