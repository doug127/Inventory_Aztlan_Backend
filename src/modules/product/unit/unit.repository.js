import { Unit } from '#src/database/models/index.model.js';
import { Op } from 'sequelize';

export const getAllUnitsRepository = async ({
    filters,
    limit,
    offset,
    order,
}) => {
    const where = {};

    if (filters.name) {
        where.name = { [Op.iLike]: `%${filters.name}%` };
    }

    if (filters.code) {
        where.code = { [Op.iLike]: `%${filters.code}%` };
    }

    if (filters.is_active !== undefined) {
        where.is_active = filters.is_active;
    }

    const baseUnitWhere = {};
    const hasBaseUnitFilter = Boolean(filters.base_unit);

    if (hasBaseUnitFilter) {
        baseUnitWhere.name = {
            [Op.iLike]: `%${filters.base_unit}%`,
        };
    }

    return await Unit.findAndCountAll({
        where,
        include: [
            {
                model: Unit,
                as: "base_unit",
                attributes: ["id", "name", "code"],
                required: hasBaseUnitFilter, // 👈 INNER JOIN solo cuando hay filtro
                where: hasBaseUnitFilter ? baseUnitWhere : undefined,
            },
        ],
        order: [["name", order]],
        limit,
        offset,
        distinct: true, // 👈 ver nota abajo
    });
};

export const getUnitByIdRepository = async (id) => {
  return await Unit.findByPk(id, {
    attributes: ['id', 'name', 'code', 'is_active', 'conversion_factor'],
    include: [
      {
        model: Unit,
        as: 'base_unit',
        attributes: ['id', 'name', 'code'],
        required: false
      }
    ]
  });
};

export const getBaseUnitsRepository = async () => {
  return await Unit.findAll({
    attributes: ['id', 'name', 'code', 'is_active', 'conversion_factor'],
    where: { base_unit_id: null },
    include: [
      {
        model: Unit,
        as: 'base_unit',
        attributes: ['name', 'code'],
        required: false
      }
    ],
    order: [['name', 'ASC']]
  });
};

export const createUnitRepository = async (data) => {
    return await Unit.create(data);
};

export const updateUnitRepository = async (id, updates) => {
    const unit = await Unit.findByPk(id);
    if (!unit) return null;
    return await unit.update(updates);
};

export const deleteUnitRepository = async (id) => {
    const [updated] = await Unit.update(
        { is_active: false }, 
        { where: { id } }
    );

    if(!updated) return null;
    return await Unit.findByPk(id);
};