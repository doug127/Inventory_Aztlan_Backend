import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAssetService } from "@/services/assets.js";
import { createAssetRepository } from "@/repositories/assets.js";

vi.mock("@/repositories/assets.js", () => ({
  createAssetRepository: vi.fn()
}));

describe("createAssetService", () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("crea un asset correctamente", async () => {

    const mockAsset = {
      id: 1,
      name: "Laptop"
    };

    createAssetRepository.mockResolvedValue(mockAsset);

    const result = await createAssetService({
      name: "Laptop"
    });

    expect(createAssetRepository)
      .toHaveBeenCalledWith({ name: "Laptop" });

    expect(result).toEqual(mockAsset);

  });

  it("lanza error si DTO falla", async () => {

    await expect(
      createAssetService({ name: "" })
    ).rejects.toThrow("El campo 'name' no puede estar vacío");

  });

});