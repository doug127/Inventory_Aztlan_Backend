// Catálogo: warehouses, product_categories, units, products, asset_categories, assets
export const up = async (queryInterface) => {
  await queryInterface.sequelize.query(`
    CREATE TABLE warehouses (
      id         SERIAL PRIMARY KEY,
      code       VARCHAR(4)   NOT NULL,
      name       VARCHAR(100) NOT NULL,
      is_active  BOOLEAN      NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
      CONSTRAINT uq_warehouses_code UNIQUE (code),
      CONSTRAINT uq_warehouses_name UNIQUE (name),
      CONSTRAINT chk_warehouses_code CHECK (code ~ '^[A-Z0-9]{4}$')
    );

    CREATE TABLE product_categories (
      id          SERIAL PRIMARY KEY,
      code        VARCHAR(4)   NOT NULL,
      name        VARCHAR(100) NOT NULL,
      description TEXT,
      parent_id   INTEGER,
      is_active   BOOLEAN      NOT NULL DEFAULT true,
      created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
      CONSTRAINT uq_product_categories_code UNIQUE (code),
      CONSTRAINT uq_product_categories_parent_name UNIQUE NULLS NOT DISTINCT (parent_id, name),
      CONSTRAINT fk_product_categories_parent_id FOREIGN KEY (parent_id)
        REFERENCES product_categories(id) ON DELETE RESTRICT,
      CONSTRAINT chk_product_categories_code   CHECK (code ~ '^[A-Z]{4}$'),
      CONSTRAINT chk_product_categories_parent CHECK (parent_id IS NULL OR parent_id <> id)
    );
    CREATE INDEX idx_product_categories_parent_id ON product_categories (parent_id);

    CREATE TABLE units (
      id                SERIAL PRIMARY KEY,
      code              VARCHAR(10)   NOT NULL,
      name              VARCHAR(50)   NOT NULL,
      base_unit_id      INTEGER,
      conversion_factor NUMERIC(18,6) NOT NULL DEFAULT 1,
      is_active         BOOLEAN       NOT NULL DEFAULT true,
      created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
      updated_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
      CONSTRAINT uq_units_code UNIQUE (code),
      CONSTRAINT uq_units_name UNIQUE (name),
      CONSTRAINT fk_units_base_unit_id FOREIGN KEY (base_unit_id) REFERENCES units(id) ON DELETE RESTRICT,
      CONSTRAINT chk_units_code   CHECK (code ~ '^[A-Z]{1,10}$'),
      CONSTRAINT chk_units_factor CHECK (conversion_factor > 0),
      CONSTRAINT chk_units_base_factor CHECK (base_unit_id IS NOT NULL OR conversion_factor = 1),
      CONSTRAINT chk_units_not_self_base CHECK (base_unit_id IS NULL OR base_unit_id <> id)
    );

    CREATE TABLE products (
      id                  SERIAL PRIMARY KEY,
      code                VARCHAR(30)   NOT NULL,
      name                VARCHAR(150)  NOT NULL,
      product_category_id INTEGER       NOT NULL,
      unit_id             INTEGER       NOT NULL,
      min_stock           NUMERIC(14,3) NOT NULL DEFAULT 0,
      max_stock           NUMERIC(14,3),
      is_active           BOOLEAN       NOT NULL DEFAULT true,
      created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
      updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
      CONSTRAINT uq_products_code UNIQUE (code),
      CONSTRAINT fk_products_product_category_id FOREIGN KEY (product_category_id)
        REFERENCES product_categories(id) ON DELETE RESTRICT,
      CONSTRAINT fk_products_unit_id FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE RESTRICT,
      CONSTRAINT chk_products_code      CHECK (code ~ '^[A-Z]{4}-[0-9]{4}$'),
      CONSTRAINT chk_products_min_stock CHECK (min_stock >= 0),
      CONSTRAINT chk_products_max_stock CHECK (max_stock IS NULL OR max_stock >= min_stock)
    );
    CREATE INDEX idx_products_product_category_id ON products (product_category_id);

    CREATE TABLE asset_categories (
      id         SERIAL PRIMARY KEY,
      code       VARCHAR(20)  NOT NULL,
      name       VARCHAR(100) NOT NULL,
      parent_id  INTEGER,
      is_active  BOOLEAN      NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
      CONSTRAINT uq_asset_categories_code UNIQUE (code),
      CONSTRAINT uq_asset_categories_parent_name UNIQUE NULLS NOT DISTINCT (parent_id, name),
      CONSTRAINT fk_asset_categories_parent_id FOREIGN KEY (parent_id)
        REFERENCES asset_categories(id) ON DELETE RESTRICT,
      CONSTRAINT chk_asset_categories_code   CHECK (code ~ '^[A-Z][A-Z0-9_]{1,19}$'),
      CONSTRAINT chk_asset_categories_parent CHECK (parent_id IS NULL OR parent_id <> id)
    );
    CREATE INDEX idx_asset_categories_parent_id ON asset_categories (parent_id);

    CREATE TABLE assets (
      id                SERIAL PRIMARY KEY,
      code              VARCHAR(10)  NOT NULL,
      name              VARCHAR(100) NOT NULL,
      asset_category_id INTEGER      NOT NULL,
      is_active         BOOLEAN      NOT NULL DEFAULT true,
      created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
      updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
      CONSTRAINT uq_assets_code UNIQUE (code),
      CONSTRAINT uq_assets_category_name UNIQUE (asset_category_id, name),
      CONSTRAINT fk_assets_asset_category_id FOREIGN KEY (asset_category_id)
        REFERENCES asset_categories(id) ON DELETE RESTRICT,
      CONSTRAINT chk_assets_code CHECK (code ~ '^[A-Z]{1,4}-[A-Z0-9]{1,5}$')
    );
    CREATE INDEX idx_assets_asset_category_id ON assets (asset_category_id);
  `);
};

export const down = async (queryInterface) => {
  await queryInterface.sequelize.query(`
    DROP TABLE IF EXISTS assets;
    DROP TABLE IF EXISTS asset_categories;
    DROP TABLE IF EXISTS products;
    DROP TABLE IF EXISTS units;
    DROP TABLE IF EXISTS product_categories;
    DROP TABLE IF EXISTS warehouses;
  `);
};
