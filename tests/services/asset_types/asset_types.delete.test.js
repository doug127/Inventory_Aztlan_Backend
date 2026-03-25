import { describe, it, expect, vi, beforeEach } from "vitest";
import { deleteAssetTypeService } from "@/services/asset_types.js";
import {
  getAssetTypeByIdRepository,
  deleteAssetTypeRepository
} from "@/repositories/asset_types.js";

vi.mock("@/repositories/asset_types.js", () => ({
  getAssetTypeByIdRepository: vi.fn(),
  deleteAssetTypeRepository: vi.fn()
}));

describe("deleteAssetTypeService", () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lanza error si ID inválido", async () => {

    await expect(
      deleteAssetTypeService("abc")
    ).rejects.toThrow("ID inválido");

  });

  it("lanza error si no existe el asset type", async () => {

    getAssetTypeByIdRepository.mockResolvedValue(null);

    await expect(
      deleteAssetTypeService(1)
    ).rejects.toThrow("Tipo de asset no encontrado");

  });

  it("elimina correctamente el asset type", async () => {

    const asset = { id: 1, name: "Laptop" };

    getAssetTypeByIdRepository.mockResolvedValue(asset);
    deleteAssetTypeRepository.mockResolvedValue(true);

    const result = await deleteAssetTypeService(1);

    expect(deleteAssetTypeRepository)
      .toHaveBeenCalledWith(asset);

    expect(result).toBe(true);

  });
});