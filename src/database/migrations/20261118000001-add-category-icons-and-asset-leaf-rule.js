// HU-301. Iconos de categorías raíz y regla de categoría hoja para activos (business_rules.md §6.2.4).
//  - product_categories.icon y asset_categories.icon: nombre de un icono de lucide. Solo las raíces
//    lo guardan (chk_*_icon_root); las subcategorías muestran el de su raíz.
//  - trg_assets_leaf_category: un activo solo va en una categoría sin hijas (CATEGORY_NOT_LEAF).
//  - trg_asset_categories_parent_rule: no se crean ni se mueven subcategorías bajo una categoría que
//    ya tiene activos (CATEGORY_HAS_ASSETS).
// Los services validan lo mismo antes, con bloqueos de fila; los triggers son la última defensa.

const ICON_FORMAT = `'^[a-z0-9]+(-[a-z0-9]+)*$'`;

// Iconos de las raíces sembradas (naming_conventions.md §6.1 y §7.1).
const PRODUCT_ROOT_ICONS = [
  ['COMB', 'fuel'],
  ['LUBR', 'droplet'],
  ['INSU', 'sprout'],
  ['REPU', 'cog'],
  ['HERR', 'wrench'],
  ['EPPS', 'hard-hat'],
];
const ASSET_ROOT_ICONS = [
  ['VEHICULOS', 'tractor'],
  ['PERSONAL', 'users'],
  ['CAMPO', 'wheat'],
  ['TALLER', 'warehouse'],
  ['EXTERNO', 'handshake'],
];

const values = (pairs) => pairs.map(([code, icon]) => `('${code}', '${icon}')`).join(', ');

export const up = async (queryInterface) => {
  await queryInterface.sequelize.query(`
    ALTER TABLE product_categories
      ADD COLUMN icon VARCHAR(40),
      ADD CONSTRAINT chk_product_categories_icon CHECK (icon IS NULL OR icon ~ ${ICON_FORMAT}),
      ADD CONSTRAINT chk_product_categories_icon_root CHECK (parent_id IS NULL OR icon IS NULL);

    ALTER TABLE asset_categories
      ADD COLUMN icon VARCHAR(40),
      ADD CONSTRAINT chk_asset_categories_icon CHECK (icon IS NULL OR icon ~ ${ICON_FORMAT}),
      ADD CONSTRAINT chk_asset_categories_icon_root CHECK (parent_id IS NULL OR icon IS NULL);

    UPDATE product_categories c SET icon = v.icon
      FROM (VALUES ${values(PRODUCT_ROOT_ICONS)}) AS v(code, icon)
      WHERE c.code = v.code AND c.parent_id IS NULL;

    UPDATE asset_categories c SET icon = v.icon
      FROM (VALUES ${values(ASSET_ROOT_ICONS)}) AS v(code, icon)
      WHERE c.code = v.code AND c.parent_id IS NULL;

    CREATE FUNCTION fn_assets_leaf_category() RETURNS trigger AS $$
    BEGIN
      IF EXISTS (SELECT 1 FROM asset_categories WHERE parent_id = NEW.asset_category_id) THEN
        RAISE EXCEPTION 'CATEGORY_NOT_LEAF: los activos solo van en categorías sin subcategorías'
          USING ERRCODE = 'check_violation';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER trg_assets_leaf_category
      BEFORE INSERT OR UPDATE OF asset_category_id ON assets
      FOR EACH ROW EXECUTE FUNCTION fn_assets_leaf_category();

    CREATE FUNCTION fn_asset_categories_parent_rule() RETURNS trigger AS $$
    BEGIN
      IF NEW.parent_id IS NOT NULL
         AND (TG_OP = 'INSERT' OR NEW.parent_id IS DISTINCT FROM OLD.parent_id)
         AND EXISTS (SELECT 1 FROM assets WHERE asset_category_id = NEW.parent_id) THEN
        RAISE EXCEPTION 'CATEGORY_HAS_ASSETS: la categoría padre tiene activos y no admite subcategorías'
          USING ERRCODE = 'check_violation';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER trg_asset_categories_parent_rule
      BEFORE INSERT OR UPDATE OF parent_id ON asset_categories
      FOR EACH ROW EXECUTE FUNCTION fn_asset_categories_parent_rule();
  `);
};

export const down = async (queryInterface) => {
  await queryInterface.sequelize.query(`
    DROP TRIGGER IF EXISTS trg_asset_categories_parent_rule ON asset_categories;
    DROP FUNCTION IF EXISTS fn_asset_categories_parent_rule();
    DROP TRIGGER IF EXISTS trg_assets_leaf_category ON assets;
    DROP FUNCTION IF EXISTS fn_assets_leaf_category();
    ALTER TABLE asset_categories
      DROP CONSTRAINT IF EXISTS chk_asset_categories_icon_root,
      DROP CONSTRAINT IF EXISTS chk_asset_categories_icon,
      DROP COLUMN IF EXISTS icon;
    ALTER TABLE product_categories
      DROP CONSTRAINT IF EXISTS chk_product_categories_icon_root,
      DROP CONSTRAINT IF EXISTS chk_product_categories_icon,
      DROP COLUMN IF EXISTS icon;
  `);
};
