export const up = async (queryInterface, Sequelize) => {
    const stocksToSeed = [
      { warehouseCode: 'AG01', productCode: 'GAS-001', quantity: 200 },
      { warehouseCode: 'AG01', productCode: 'GAS-002', quantity: 2000 },
      { warehouseCode: 'AG01', productCode: 'LUB-SAE-15w40', quantity: 645 },
      { warehouseCode: 'AG01', productCode: 'LUB-SAE-50', quantity: 250 },
      { warehouseCode: 'AG01', productCode: 'LUB-85w40', quantity: 60 },
      { warehouseCode: 'AG01', productCode: 'LUB-2T', quantity: 5 },
      { warehouseCode: 'AG01', productCode: 'HERB-001', quantity: 45 },
      { warehouseCode: 'AG01', productCode: 'ABO-UREA', quantity: 800 },
      { warehouseCode: 'AG01', productCode: 'ABO-18-18-18', quantity: 400 },
      { warehouseCode: 'AG01', productCode: 'ABO-46-00-00', quantity: 450 },
      { warehouseCode: 'AG01', productCode: 'COAD-001', quantity: 10 },
      { warehouseCode: 'AC02', productCode: 'GAS-001', quantity: 0 },
      { warehouseCode: 'AC02', productCode: 'LUB-SAE-50', quantity: 200 },
    ];

    await queryInterface.bulkInsert('stocks', 
      stocksToSeed.map(stock => ({
        product_id: Sequelize.literal(`(SELECT id FROM products WHERE code = '${stock.productCode}')`),
        warehouse_id: Sequelize.literal(`(SELECT id FROM warehouses WHERE code = '${stock.warehouseCode}')`),
        quantity: stock.quantity,
        createdAt: new Date(),
        updatedAt: new Date()
      })),
      {
        ignoreDuplicates: true // Evita errores por duplicados si el seeder se ejecuta varias veces
      }
    );
}

export const down = async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('stocks', null, {});
}
