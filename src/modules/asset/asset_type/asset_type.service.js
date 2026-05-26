import {
    createAssetTypeRepository,
    getAllAssetTypesRepository,
    getAssetTypeByIdRepository,
    updateAssetTypeRepository,
    deleteAssetTypeRepository
} from "./asset_type.repository.js";
import { assetTypeDTO } from "./asset_type.dto.js";

export const getAllAssetTypesService = async () => {
    const types = await getAllAssetTypesRepository();

    const payload = types.map(assetTypeDTO);

    return payload;
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

    const payload = assetTypeDTO(assetType);

    return payload;
};

export const createAssetTypeService = async (data) => {
    
    const assetType = await createAssetTypeRepository(data);
    
    const payload = assetTypeDTO(assetType);
    
    return payload;
};

export const updateAssetTypeService = async (id, data) => {
    const assetTypeId = Number(id);

    if (isNaN(assetTypeId)) throw new Error("ID inválido");

    const assetType = await getAssetTypeByIdRepository(assetTypeId);

    if (!assetType) {
        throw new Error("Tipo de asset no encontrado");
    }

    const updatedAssetType = await updateAssetTypeRepository(assetType, data);

    const payload = assetTypeDTO(updatedAssetType);

    return payload;
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