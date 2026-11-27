// Documentos de recepción de las entradas (HU-402, ajuste): facturas, vales, recibos de compra, notas
// de entrega, guías de despacho y órdenes de compra. Una entrada puede llevar varios (la factura y la
// guía de la misma compra). Cada documento guarda sus datos y, opcionalmente, el archivo escaneado
// (PDF o foto), que vive en disco (FILE_STORAGE_DIR) y aquí solo se referencia por file_storage_key.
//
// Son parte del movimiento, así que heredan su inmutabilidad (trg_movement_documents_rules):
//  - Solo se agregan a movimientos IN.
//  - No se eliminan.
//  - La única modificación permitida es adjuntar el archivo una vez (las columnas file_* pasan de
//    NULL a un valor). Los datos del documento y un archivo ya adjunto no cambian.
export const up = async (queryInterface) => {
  await queryInterface.sequelize.query(`
    CREATE TABLE movement_documents (
      id                       SERIAL        PRIMARY KEY,
      movement_header_id       INTEGER       NOT NULL,
      document_type            VARCHAR(20)   NOT NULL,
      document_number          VARCHAR(40)   NOT NULL,
      supplier_name            VARCHAR(150),
      supplier_tax_id          VARCHAR(20),
      issue_date               DATE,
      total_amount             NUMERIC(14,2),
      currency                 CHAR(3),
      file_storage_key         VARCHAR(80),
      file_original_name       VARCHAR(255),
      file_mime_type           VARCHAR(50),
      file_size_bytes          INTEGER,
      file_sha256              CHAR(64),
      file_uploaded_at         TIMESTAMPTZ,
      file_uploaded_by_user_id INTEGER,
      created_at               TIMESTAMPTZ   NOT NULL DEFAULT now(),

      CONSTRAINT fk_movement_documents_movement_header_id FOREIGN KEY (movement_header_id)
        REFERENCES movement_headers(id) ON DELETE RESTRICT,
      CONSTRAINT fk_movement_documents_file_uploaded_by_user_id FOREIGN KEY (file_uploaded_by_user_id)
        REFERENCES users(id) ON DELETE RESTRICT,
      CONSTRAINT uq_movement_documents_header_type_number UNIQUE (movement_header_id, document_type, document_number),
      CONSTRAINT uq_movement_documents_file_storage_key UNIQUE (file_storage_key),

      CONSTRAINT chk_movement_documents_type
        CHECK (document_type IN ('FACTURA', 'VALE', 'RECIBO', 'NOTA_ENTREGA', 'GUIA_DESPACHO', 'ORDEN_COMPRA')),
      CONSTRAINT chk_movement_documents_number CHECK (document_number ~ '^[A-Z0-9][A-Z0-9-]{0,39}$'),
      CONSTRAINT chk_movement_documents_supplier_tax_id
        CHECK (supplier_tax_id IS NULL OR supplier_tax_id ~ '^[A-Z0-9][A-Z0-9.-]{2,19}$'),
      CONSTRAINT chk_movement_documents_total_amount CHECK (total_amount IS NULL OR total_amount >= 0),
      CONSTRAINT chk_movement_documents_currency
        CHECK (currency IS NULL OR (currency ~ '^[A-Z]{3}$' AND total_amount IS NOT NULL)),
      CONSTRAINT chk_movement_documents_file_mime_type
        CHECK (file_mime_type IS NULL OR file_mime_type IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
      CONSTRAINT chk_movement_documents_file_size CHECK (file_size_bytes IS NULL OR file_size_bytes BETWEEN 1 AND 10485760),
      CONSTRAINT chk_movement_documents_file_sha256 CHECK (file_sha256 IS NULL OR file_sha256 ~ '^[0-9a-f]{64}$'),
      -- El archivo está completo o no está: todas las columnas file_* con valor o todas en NULL.
      CONSTRAINT chk_movement_documents_file_complete CHECK (
        (file_storage_key IS NULL AND file_original_name IS NULL AND file_mime_type IS NULL AND file_size_bytes IS NULL
          AND file_sha256 IS NULL AND file_uploaded_at IS NULL AND file_uploaded_by_user_id IS NULL)
        OR
        (file_storage_key IS NOT NULL AND file_original_name IS NOT NULL AND file_mime_type IS NOT NULL AND file_size_bytes IS NOT NULL
          AND file_sha256 IS NOT NULL AND file_uploaded_at IS NOT NULL AND file_uploaded_by_user_id IS NOT NULL)
      )
    );

    CREATE INDEX idx_movement_documents_movement_header_id ON movement_documents (movement_header_id);
    -- Búsqueda de una factura o vale por su número (HU-408).
    CREATE INDEX idx_movement_documents_type_number ON movement_documents (document_type, document_number);

    CREATE FUNCTION fn_movement_documents_rules() RETURNS trigger AS $$
    DECLARE
      h_type movement_type_enum;
    BEGIN
      IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'MOVEMENT_IMMUTABLE: los documentos de recepción no se eliminan'
          USING ERRCODE = 'P0001';
      END IF;

      IF TG_OP = 'INSERT' THEN
        SELECT movement_type INTO h_type FROM movement_headers WHERE id = NEW.movement_header_id;
        IF h_type IS DISTINCT FROM 'IN' THEN
          RAISE EXCEPTION 'VALIDATION_ERROR: solo las entradas llevan documentos de recepción'
            USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END IF;

      -- UPDATE: solo adjuntar el archivo, una vez, sin tocar los datos del documento.
      IF OLD.file_storage_key IS NOT NULL THEN
        RAISE EXCEPTION 'DOCUMENT_FILE_EXISTS: el documento ya tiene su archivo adjunto'
          USING ERRCODE = 'P0001';
      END IF;
      IF NEW.id IS DISTINCT FROM OLD.id
        OR NEW.movement_header_id IS DISTINCT FROM OLD.movement_header_id
        OR NEW.document_type IS DISTINCT FROM OLD.document_type
        OR NEW.document_number IS DISTINCT FROM OLD.document_number
        OR NEW.supplier_name IS DISTINCT FROM OLD.supplier_name
        OR NEW.supplier_tax_id IS DISTINCT FROM OLD.supplier_tax_id
        OR NEW.issue_date IS DISTINCT FROM OLD.issue_date
        OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
        OR NEW.currency IS DISTINCT FROM OLD.currency
        OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'MOVEMENT_IMMUTABLE: los datos de un documento de recepción no se modifican'
          USING ERRCODE = 'P0001';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER trg_movement_documents_rules
      BEFORE INSERT OR UPDATE OR DELETE ON movement_documents
      FOR EACH ROW EXECUTE FUNCTION fn_movement_documents_rules();
  `);
};

export const down = async (queryInterface) => {
  await queryInterface.sequelize.query(`
    DROP TRIGGER IF EXISTS trg_movement_documents_rules ON movement_documents;
    DROP FUNCTION IF EXISTS fn_movement_documents_rules();
    DROP TABLE IF EXISTS movement_documents;
  `);
};
