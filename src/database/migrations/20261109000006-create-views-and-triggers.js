// Vistas (v_kardex, v_stock_alerts) y triggers (inmutabilidad, regla de asset_id, updated_at)
const UPDATED_AT_TABLES = [
  'roles', 'users', 'warehouses', 'product_categories', 'units', 'products', 'asset_categories', 'assets'
];

export const up = async (queryInterface) => {
  await queryInterface.sequelize.query(`
    CREATE VIEW v_kardex AS
    SELECT h.id AS movement_id, h.document_number, h.movement_date, h.movement_type, h.reason,
           h.created_by_user_id, h.warehouse_from_id AS warehouse_id,
           l.product_id, l.asset_id, -l.quantity AS delta
    FROM movement_headers h
    JOIN movement_lines l ON l.movement_header_id = h.id
    WHERE h.warehouse_from_id IS NOT NULL
    UNION ALL
    SELECT h.id, h.document_number, h.movement_date, h.movement_type, h.reason,
           h.created_by_user_id, h.warehouse_to_id,
           l.product_id, l.asset_id, l.quantity
    FROM movement_headers h
    JOIN movement_lines l ON l.movement_header_id = h.id
    WHERE h.warehouse_to_id IS NOT NULL;

    CREATE VIEW v_stock_alerts AS
    SELECT p.id AS product_id,
           p.code AS product_code,
           t.total_quantity,
           p.min_stock,
           p.max_stock,
           CASE WHEN t.total_quantity < p.min_stock THEN 'BAJO_MINIMO'
                ELSE 'SOBRE_MAXIMO' END AS alert
    FROM products p
    CROSS JOIN LATERAL (
      SELECT COALESCE(SUM(s.quantity), 0)::NUMERIC(14,3) AS total_quantity
      FROM stock s WHERE s.product_id = p.id
    ) t
    WHERE p.is_active
      AND (t.total_quantity < p.min_stock
           OR (p.max_stock IS NOT NULL AND t.total_quantity > p.max_stock));

    -- Inmutabilidad de movimientos
    CREATE FUNCTION fn_movements_immutable() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'MOVEMENT_IMMUTABLE: los movimientos no se modifican ni se eliminan (%)', TG_TABLE_NAME
        USING ERRCODE = 'P0001';
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER trg_movements_immutable
      BEFORE UPDATE OR DELETE ON movement_headers
      FOR EACH ROW EXECUTE FUNCTION fn_movements_immutable();
    CREATE TRIGGER trg_movements_immutable
      BEFORE UPDATE OR DELETE ON movement_lines
      FOR EACH ROW EXECUTE FUNCTION fn_movements_immutable();

    -- Regla de asset_id según tipo y motivo de la cabecera
    CREATE FUNCTION fn_movement_lines_asset_rule() RETURNS trigger AS $$
    DECLARE
      h_type   movement_type_enum;
      h_reason movement_reason_enum;
      asset_required  BOOLEAN;
      asset_forbidden BOOLEAN;
    BEGIN
      SELECT movement_type, reason INTO h_type, h_reason
      FROM movement_headers WHERE id = NEW.movement_header_id;

      asset_required  := (h_type = 'OUT' AND h_reason IN ('CONSUMO', 'PRESTAMO'))
                      OR (h_type = 'IN'  AND h_reason = 'DEVOLUCION');
      asset_forbidden := (h_type = 'IN' AND h_reason = 'COMPRA')
                      OR h_type IN ('TRANSFER', 'ADJUST');

      IF asset_required AND NEW.asset_id IS NULL THEN
        RAISE EXCEPTION 'ASSET_REQUIRED: % / % exige un activo en cada línea', h_type, h_reason
          USING ERRCODE = '23514';
      END IF;
      IF asset_forbidden AND NEW.asset_id IS NOT NULL THEN
        RAISE EXCEPTION 'ASSET_NOT_ALLOWED: % / % no admite activo en las líneas', h_type, h_reason
          USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER trg_movement_lines_asset_rule
      BEFORE INSERT ON movement_lines
      FOR EACH ROW EXECUTE FUNCTION fn_movement_lines_asset_rule();

    ${UPDATED_AT_TABLES.map((t) => `
    CREATE TRIGGER trg_set_updated_at
      BEFORE UPDATE ON ${t}
      FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();`).join('\n')}
  `);
};

export const down = async (queryInterface) => {
  await queryInterface.sequelize.query(`
    ${UPDATED_AT_TABLES.map((t) => `DROP TRIGGER IF EXISTS trg_set_updated_at ON ${t};`).join('\n')}
    DROP TRIGGER IF EXISTS trg_movement_lines_asset_rule ON movement_lines;
    DROP TRIGGER IF EXISTS trg_movements_immutable ON movement_lines;
    DROP TRIGGER IF EXISTS trg_movements_immutable ON movement_headers;
    DROP FUNCTION IF EXISTS fn_movement_lines_asset_rule();
    DROP FUNCTION IF EXISTS fn_movements_immutable();
    DROP VIEW IF EXISTS v_stock_alerts;
    DROP VIEW IF EXISTS v_kardex;
  `);
};
