// Los 4 roles del sistema. La aplicación compara siempre por code/hierarchy, nunca por name.
export const up = async (queryInterface) => {
  await queryInterface.sequelize.query(`
    INSERT INTO roles (code, name, description, hierarchy) VALUES
      ('SUPERADMIN',  'Superadministrador', 'Responsable técnico del sistema. Control total.', 0),
      ('ADMIN',       'Administrador',      'Gerencia o jefatura. Gestiona usuarios operativos, catálogos, ajustes y correcciones.', 1),
      ('ALMACENISTA', 'Almacenista',        'Encargado de almacén. Registra entradas, órdenes de retiro y traslados.', 2),
      ('USUARIO',     'Usuario',            'Supervisores, operadores y personal administrativo. Solo consulta.', 3);
  `);
};

export const down = async (queryInterface) => {
  await queryInterface.sequelize.query(
    `DELETE FROM roles WHERE code IN ('SUPERADMIN', 'ADMIN', 'ALMACENISTA', 'USUARIO');`
  );
};
