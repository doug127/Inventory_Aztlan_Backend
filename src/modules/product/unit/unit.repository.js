// Consultas de unidades (HU-202). No valida ni lanza errores de negocio: devuelve objetos planos o
// null y el service decide. conversionFactor llega como string (NUMERIC): se opera con decimal.js.
import { Op, QueryTypes, Transaction } from 'sequelize';
import { sequelize } from '#src/config/database.js';
import { Unit } from '#src/database/models/index.model.js';

const plain = (row) => (row ? row.get({ plain: true }) : null);

const BASE_INCLUDE = { model: Unit, as: 'baseUnit', attributes: ['id', 'code', 'name', 'isActive'] };

// Uso de la unidad, para saber si se puede desactivar o cambiar (subconsultas con "Unit".id).
const USAGE_ATTRIBUTES = [
  [sequelize.literal('(SELECT count(*)::int FROM products p WHERE p.unit_id = "Unit".id AND p.is_active)'), 'activeProducts'],
  [sequelize.literal('(SELECT count(*)::int FROM products p WHERE p.unit_id = "Unit".id)'), 'totalProducts'],
  [sequelize.literal('(SELECT count(*)::int FROM units d WHERE d.base_unit_id = "Unit".id AND d.is_active)'), 'activeDerivedUnits'],
  [sequelize.literal('(SELECT count(*)::int FROM units d WHERE d.base_unit_id = "Unit".id)'), 'totalDerivedUnits'],
];

const SORT_COLUMNS = { code: ['code'], name: ['name'], createdAt: ['createdAt'] };

/**
 * Lista paginada. kind: 'base' (sin unidad base) | 'derived'. baseUnitId: la base y sus derivadas
 * (toda la "familia" de una unidad).
 */
export const listUnits = async ({ page, limit, search, isActive, kind, baseUnitId, sort, order }) => {
  const and = [];
  if (isActive !== undefined) and.push({ isActive });
  if (kind === 'base') and.push({ baseUnitId: null });
  if (kind === 'derived') and.push({ baseUnitId: { [Op.ne]: null } });
  if (baseUnitId) and.push({ [Op.or]: [{ id: baseUnitId }, { baseUnitId }] });
  if (search) {
    const pattern = `%${search.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
    and.push({ [Op.or]: [{ code: { [Op.iLike]: pattern } }, { name: { [Op.iLike]: pattern } }] });
  }
  const direction = order === 'desc' ? 'DESC' : 'ASC';
  const { rows, count } = await Unit.findAndCountAll({
    where: and.length ? { [Op.and]: and } : {},
    attributes: { include: USAGE_ATTRIBUTES },
    include: [BASE_INCLUDE],
    order: [[...SORT_COLUMNS[sort], direction], ['id', 'ASC']],
    limit,
    offset: (page - 1) * limit,
    distinct: true,
  });
  return { items: rows.map(plain), total: count };
};

/** Con lock: true bloquea la fila (FOR UPDATE OF "Unit") y no calcula el uso. */
export const findUnitById = async (id, { transaction, lock = false } = {}) =>
  plain(
    await Unit.findByPk(id, {
      attributes: lock ? undefined : { include: USAGE_ATTRIBUTES },
      include: lock ? [] : [BASE_INCLUDE],
      transaction,
      lock: lock ? { level: Transaction.LOCK.UPDATE, of: Unit } : undefined,
    })
  );

export const findUnitByCode = async (code, { transaction } = {}) =>
  plain(await Unit.findOne({ where: { code }, include: [BASE_INCLUDE], transaction }));

/** Qué campos únicos ya usa otra unidad. El nombre se compara sin distinguir mayúsculas. */
export const findTakenFields = async ({ code, name }, { excludeId } = {}) => {
  const conditions = [];
  if (code) conditions.push({ code });
  if (name) conditions.push(sequelize.where(sequelize.fn('lower', sequelize.col('name')), name.toLowerCase()));
  if (!conditions.length) return {};
  const rows = await Unit.findAll({
    where: { [Op.or]: conditions, ...(excludeId && { id: { [Op.ne]: excludeId } }) },
    attributes: ['code', 'name'],
  });
  return {
    ...(code && rows.some((r) => r.code === code) && { code: true }),
    ...(name && rows.some((r) => r.name.toLowerCase() === name.toLowerCase()) && { name: true }),
  };
};

export const createUnit = async (data, { transaction } = {}) => plain(await Unit.create(data, { transaction }));

export const updateUnit = async (id, changes, { transaction } = {}) => {
  await Unit.update(changes, { where: { id }, transaction });
};

/** Uso real de la unidad dentro de una transacción (para desactivar sin carreras). */
export const countUsage = async (unitId, { transaction } = {}) => {
  const [usage] = await sequelize.query(
    `SELECT (SELECT count(*)::int FROM products WHERE unit_id = :unitId AND is_active) AS "activeProducts",
            (SELECT count(*)::int FROM units WHERE base_unit_id = :unitId AND is_active) AS "activeDerivedUnits"`,
    { replacements: { unitId }, type: QueryTypes.SELECT, transaction }
  );
  return usage;
};

// Compatibilidad: el módulo de productos anterior (pendiente de REF-S1) importa este nombre.
export const getUnitByIdRepository = (id) => findUnitById(id);
