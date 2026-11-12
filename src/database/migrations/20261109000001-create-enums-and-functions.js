// ENUMs y función compartida de updated_at. Requiere PostgreSQL 15+.
export const up = async (queryInterface) => {
  await queryInterface.sequelize.query(`
    CREATE TYPE movement_type_enum AS ENUM ('IN', 'OUT', 'TRANSFER', 'ADJUST');
    CREATE TYPE movement_reason_enum AS ENUM (
      'COMPRA', 'DEVOLUCION', 'CONSUMO', 'PRESTAMO', 'DESECHO', 'VENTA', 'TRASLADO', 'AJUSTE', 'OTRO'
    );
    CREATE TYPE auth_event_type_enum AS ENUM (
      'LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT', 'TOKEN_REFRESHED', 'ACCOUNT_LOCKED',
      'ACCOUNT_UNLOCKED', 'PASSWORD_RESET_REQUESTED', 'PASSWORD_RESET_COMPLETED', 'PASSWORD_CHANGED'
    );
    CREATE TYPE email_template_enum AS ENUM ('WELCOME', 'PASSWORD_RESET', 'PASSWORD_CHANGED', 'ACCOUNT_LOCKED');
    CREATE TYPE email_status_enum AS ENUM ('PENDING', 'SENT', 'FAILED');

    CREATE FUNCTION fn_set_updated_at() RETURNS trigger AS $$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
};

export const down = async (queryInterface) => {
  await queryInterface.sequelize.query(`
    DROP FUNCTION IF EXISTS fn_set_updated_at();
    DROP TYPE IF EXISTS email_status_enum;
    DROP TYPE IF EXISTS email_template_enum;
    DROP TYPE IF EXISTS auth_event_type_enum;
    DROP TYPE IF EXISTS movement_reason_enum;
    DROP TYPE IF EXISTS movement_type_enum;
  `);
};
