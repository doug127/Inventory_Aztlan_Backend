import { Asset, AssetType } from "../models/index.js";

export const getAllAssetsRepository = async () => {
    return await Asset.findAll({
        attributes: ['id', 'name'],
        include: {
            model: AssetType,
            attributes: ['id', 'name'] 
        },
        where: { active: true }
    });
};

export const getAssetByIdRepository = async (id) => {
    return await Asset.findOne({
        attributes: ['id', 'name'],
        include: {
            model: AssetType,
            attributes: ['id', 'name'] 
        },
        where: { id, active: true }
    });
};

export const findAssetsByIdsRepository = async (ids, transaction) => {
    return await Asset.findAll({
        where: {
            id: ids
        },
        transaction
    });
};

export const createAssetRepository = async (data) => {
    return await Asset.create(data);
};

export const updateAssetRepository = async (id, data) => {
    return await Asset.update(data, {
        where: { id }
    });
};

export const deleteAssetRepository = async (id) => {
    return await Asset.update(
        { active: false },
        { where: { id } }
    );
};