import {
    createAssetRepository,
    getAllAssetsRepository,
    getAssetByIdRepository,
    updateAssetRepository,
    deleteAssetRepository
} from "../repositories/assets.js";
import { assetsDTO } from "../dtos/assets.js";

export const getAllAssetsService = async () => {
    const types = await getAllAssetsRepository();

    return types;
};

export const getAssetByIdService = async (id) => {
    const assetId = Number(id);

    if (isNaN(assetId)) {
        throw new Error("ID inválido");
    }

    const asset = await getAssetByIdRepository(assetId);

    if (!asset) {
        throw new Error("Activo no encontrado");
    }

    return asset;
};

export const createAssetService = async (data) => {
    const assetDTO = new assetsDTO(data);

    const dto = assetDTO.validate();

    const asset = await createAssetRepository(dto);
        
    return asset;
};

export const updateAssetService = async (id, data) => {
    const assetId = Number(id);

    if (isNaN(assetId)) throw new Error("ID inválido");

    const asset = await getAssetByIdRepository(assetId);

    if (!asset) {
        throw new Error("Activo no encontrado");
    }

    const assetDTO = new assetsDTO(data);
    const dto = assetDTO.validate();

    const updatedAsset = await updateAssetRepository(asset, dto);

    return updatedAsset;
};

export const deleteAssetService = async (id) => {
  const assetId = Number(id);

  if (isNaN(assetId)) {
    throw new Error("ID inválido");
  }

  const asset = await getAssetByIdRepository(assetId);

  if (!asset) {
    throw new Error("Activo no encontrado");
  }

  return await deleteAssetRepository(asset);
};