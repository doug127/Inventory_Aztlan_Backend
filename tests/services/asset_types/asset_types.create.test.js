import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAssetTypeService } from "@/services/asset_types.js";
import { createAssetTypeRepository } from "@/repositories/asset_types.js";

vi.mock("@/repositories/asset_types.js", () => ({
  createAssetTypeRepository: vi.fn()
}));

describe("createAssetTypeService", () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("crea un asset type correctamente", async () => {

    const mockAsset = {
      id: 1,
      name: "Laptop",
      description: "Equipo"
    };

    createAssetTypeRepository.mockResolvedValue(mockAsset);

    const result = await createAssetTypeService({
      name: "Laptop",
      description: "Equipo"
    });

    expect(createAssetTypeRepository).toHaveBeenCalledWith({
      name: "Laptop",
      description: "Equipo"
    });

    expect(result).toEqual(mockAsset);

  });

});