import {
    createAssetTypeRepository,
    getAllAssetTypesRepository,
    getAssetTypeByIdRepository,
    updateAssetTypeRepository,
    deleteAssetTypeRepository
} from "../repositories/asset_types.js";

import { assetTypesDTO } from "../dtos/asset_types.js";

export const getAllAssetTypesService = async () => {
    const types = await getAllAssetTypesRepository();

    return types;
};

export const getAssetTypeByIdService = async (id) => {
    const assetTypeId = Number(id);

    if (isNaN(assetTypeId)) {
        throw new Error("ID inválido");
    }

    const assetType = await getAssetTypeByIdRepository(assetTypeId);

    if (!assetType) {
        throw new Error("Tipo de asset no encontrado");
    }

    return assetType;
};

export const createAssetTypeService = async (data) => {
    const assetTypeDTO = new assetTypesDTO(data);

    const dto = assetTypeDTO.validate();

    const assetType = await createAssetTypeRepository(dto);
        
    return assetType;
};

export const updateAssetTypeService = async (id, data) => {
    const assetTypeId = Number(id);

    if (isNaN(assetTypeId)) throw new Error("ID inválido");

    const assetType = await getAssetTypeByIdRepository(assetTypeId);

    if (!assetType) {
        throw new Error("Tipo de asset no encontrado");
    }

    const assetTypeDTO = new assetTypesDTO(data);
    const dto = assetTypeDTO.validate();

    const updatedAssetType = await updateAssetTypeRepository(assetType, dto);

    return updatedAssetType;
};

export const deleteAssetTypeService = async (id) => {
  const assetTypeId = Number(id);

  if (isNaN(assetTypeId)) {
    throw new Error("ID inválido");
  }

  const assetType = await getAssetTypeByIdRepository(assetTypeId);

  if (!assetType) {
    throw new Error("Tipo de asset no encontrado");
  }

  return await deleteAssetTypeRepository(assetType);
};