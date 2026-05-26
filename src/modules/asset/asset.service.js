import {
    createAssetRepository,
    getAllAssetsRepository,
    getAssetByIdRepository,
    updateAssetRepository,
    deleteAssetRepository
} from "./asset.repository.js";
import { assetDTO } from "./asset.dto.js";

export const getAllAssetsService = async () => {
    const types = await getAllAssetsRepository();
    
    const payload = types.map(assetDTO);

    return payload;
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

    const payload = assetDTO(asset);

    return payload;
};

export const createAssetService = async (data) => {
    
    const asset = await createAssetRepository(data);
    
    const payload = assetDTO(asset);
    
    return payload;
};

export const updateAssetService = async (id, data) => {
    const assetId = Number(id);

    if (isNaN(assetId)) throw new Error("ID inválido");

    const asset = await getAssetByIdRepository(assetId);

    if (!asset) {
        throw new Error("Activo no encontrado");
    }

    const updatedAsset = await updateAssetRepository(asset, data);

    const payload = assetDTO(updatedAsset);

    return payload;
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