import { Unit } from '#src/database/models/index.model.js';

export const getAllUnitsRepository = async () => {
  return await Unit.findAll({
    attributes: ['id', 'name', 'code', 'is_active', 'conversion_factor'],
    include: [
      {
        model: Unit,
        as: 'base_unit',
        attributes: ['id', 'name', 'code'],
        required: false
      }
    ],
    order: [['name', 'ASC']]
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