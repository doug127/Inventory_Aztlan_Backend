// Inventario: stock, document_sequences, movement_headers, movement_lines
export const up = async (queryInterface) => {
  await queryInterface.sequelize.query(`
    CREATE TABLE stock (
      product_id   INTEGER       NOT NULL,
      warehouse_id INTEGER       NOT NULL,
      quantity     NUMERIC(14,3) NOT NULL DEFAULT 0,
      last_update  TIMESTAMPTZ   NOT NULL DEFAULT now(),
      CONSTRAINT pk_stock PRIMARY KEY (product_id, warehouse_id),
      CONSTRAINT fk_stock_product_id   FOREIGN KEY (product_id)   REFERENCES products(id)   ON DELETE RESTRICT,
      CONSTRAINT fk_stock_warehouse_id FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE RESTRICT,
      CONSTRAINT chk_stock_quantity CHECK (quantity >= 0)
    );
    CREATE INDEX idx_stock_warehouse_id ON stock (warehouse_id);

    CREATE TABLE document_sequences (
      movement_type movement_type_enum PRIMARY KEY,
      prefix        VARCHAR(3) NOT NULL,
      last_number   INTEGER    NOT NULL DEFAULT 0,
      CONSTRAINT uq_document_sequences_prefix UNIQUE (prefix),
      CONSTRAINT chk_document_sequences_last_number CHECK (last_number >= 0)
    );

    CREATE TABLE movement_headers (
      id                 SERIAL PRIMARY KEY,
      document_number    VARCHAR(10)          NOT NULL,
      movement_type      movement_type_enum   NOT NULL,
      reason             movement_reason_enum NOT NULL,
      reference          VARCHAR(100),
      movement_date      TIMESTAMPTZ          NOT NULL DEFAULT now(),
      created_by_user_id INTEGER              NOT NULL,
      warehouse_from_id  INTEGER,
      warehouse_to_id    INTEGER,
      received_by        VARCHAR(150),
      note               TEXT,
      idempotency_key    UUID,
      created_at         TIMESTAMPTZ          NOT NULL DEFAULT now(),
      CONSTRAINT uq_movement_headers_document_number  UNIQUE (document_number),
      CONSTRAINT uq_movement_headers_idempotency_key  UNIQUE (idempotency_key),
      CONSTRAINT fk_movement_headers_created_by_user_id FOREIGN KEY (created_by_user_id)
        REFERENCES users(id) ON DELETE RESTRICT,
      CONSTRAINT fk_movement_headers_warehouse_from_id FOREIGN KEY (warehouse_from_id)
        REFERENCES warehouses(id) ON DELETE RESTRICT,
      CONSTRAINT fk_movement_headers_warehouse_to_id FOREIGN KEY (warehouse_to_id)
        REFERENCES warehouses(id) ON DELETE RESTRICT,
      CONSTRAINT chk_movement_headers_document_number
        CHECK (document_number ~ '^(ENT|RET|TRF|AJU)-[0-9]{6}$'),
      CONSTRAINT chk_movement_warehouses CHECK (
        (movement_type = 'IN'       AND warehouse_from_id IS NULL     AND warehouse_to_id IS NOT NULL) OR
        (movement_type = 'OUT'      AND warehouse_from_id IS NOT NULL AND warehouse_to_id IS NULL) OR
        (movement_type = 'TRANSFER' AND warehouse_from_id IS NOT NULL AND warehouse_to_id IS NOT NULL
                                    AND warehouse_from_id <> warehouse_to_id) OR
        (movement_type = 'ADJUST'   AND ((warehouse_from_id IS NULL) <> (warehouse_to_id IS NULL)))
      ),
      CONSTRAINT chk_movement_reason CHECK (
        (movement_type = 'IN'       AND reason IN ('COMPRA', 'DEVOLUCION', 'OTRO')) OR
        (movement_type = 'OUT'      AND reason IN ('CONSUMO', 'PRESTAMO', 'DESECHO', 'VENTA', 'OTRO')) OR
        (movement_type = 'TRANSFER' AND reason = 'TRASLADO') OR
        (movement_type = 'ADJUST'   AND reason = 'AJUSTE')
      ),
      CONSTRAINT chk_movement_document_prefix CHECK (
        (movement_type = 'IN'       AND document_number LIKE 'ENT-%') OR
        (movement_type = 'OUT'      AND document_number LIKE 'RET-%') OR
        (movement_type = 'TRANSFER' AND document_number LIKE 'TRF-%') OR
        (movement_type = 'ADJUST'   AND document_number LIKE 'AJU-%')
      ),
      CONSTRAINT chk_movement_received_by CHECK (reason <> 'PRESTAMO' OR received_by IS NOT NULL)
    );
    CREATE INDEX idx_movement_headers_movement_date       ON movement_headers (movement_date);
    CREATE INDEX idx_movement_headers_type_date           ON movement_headers (movement_type, movement_date);
    CREATE INDEX idx_movement_headers_created_by_user_id  ON movement_headers (created_by_user_id);

    CREATE TABLE movement_lines (
      id                 SERIAL PRIMARY KEY,
      movement_header_id INTEGER       NOT NULL,
      product_id         INTEGER       NOT NULL,
      quantity           NUMERIC(14,3) NOT NULL,
      asset_id           INTEGER,
      note               TEXT,
      CONSTRAINT uq_movement_lines_header_product_asset
        UNIQUE NULLS NOT DISTINCT (movement_header_id, product_id, asset_id),
      CONSTRAINT fk_movement_lines_movement_header_id FOREIGN KEY (movement_header_id)
        REFERENCES movement_headers(id) ON DELETE RESTRICT,
      CONSTRAINT fk_movement_lines_product_id FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
      CONSTRAINT fk_movement_lines_asset_id   FOREIGN KEY (asset_id)   REFERENCES assets(id)   ON DELETE RESTRICT,
      CONSTRAINT chk_movement_lines_quantity CHECK (quantity > 0)
    );
    CREATE INDEX idx_movement_lines_product_id ON movement_lines (product_id);
    CREATE INDEX idx_movement_lines_asset_id   ON movement_lines (asset_id);
  `);
};

export const down = async (queryInterface) => {
  await queryInterface.sequelize.query(`
    DROP TABLE IF EXISTS movement_lines;
    DROP TABLE IF EXISTS movement_headers;
    DROP TABLE IF EXISTS document_sequences;
    DROP TABLE IF EXISTS stock;
  `);
};
