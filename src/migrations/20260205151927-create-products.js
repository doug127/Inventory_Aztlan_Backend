export const up = async (queryInterface, Sequelize) => {
  await queryInterface.createTable('products', {
    id: { 
      type: Sequelize.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    name: {
      type: Sequelize.STRING,
      allowNull: false
    },
    code: {  
      type: Sequelize.STRING,
      allowNull: false,
      unique: true
    },
    content_quantity: {
      type: Sequelize.FLOAT,
      allowNull: false,
      defaultValue: 1
    },
    min_stock: {
      type: Sequelize.FLOAT,
      allowNull: false,
      defaultValue: 0
    },
    max_stock: {
      type: Sequelize.FLOAT,
      allowNull: true,
      defaultValue: null
    },
    is_active: {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    product_category_id: {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: {
        model: 'category_products',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
    },
    unit_id: {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: {
        model: 'units',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
    },
    createdAt: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.NOW
    },
    updatedAt: {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.NOW
    }
  });
};

export const down = async (queryInterface, Sequelize) => {
  await queryInterface.dropTable('products');
}