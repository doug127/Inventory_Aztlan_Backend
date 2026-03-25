import { AssetType } from "../models/index.js";

export const getAllAssetTypesRepository = async () => {
    return await AssetType.findAll({
        where: { active: true }
    });
};

export const getAssetTypeByIdRepository = async (id) => {
    return await AssetType.findOne({
        where: { id, active: true }
    });
};

export const createAssetTypeRepository = async (data) => {
    return await AssetType.create(data);
};

export const updateAssetTypeRepository = async (id, data) => {
    return await AssetType.update(data, {
        where: { id }
    });
};

export const deleteAssetTypeRepository = async (id) => {
    return await AssetType.update(
        { active: false },
        { where: { id } }
    );
};