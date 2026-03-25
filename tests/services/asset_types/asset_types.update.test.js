import { describe, it, expect, vi, beforeEach } from "vitest";
import { updateAssetTypeService } from "@/services/asset_types.js";
import {
  getAssetTypeByIdRepository,
  updateAssetTypeRepository
} from "@/repositories/asset_types.js";

vi.mock("@/repositories/asset_types.js", () => ({
  getAssetTypeByIdRepository: vi.fn(),
  updateAssetTypeRepository: vi.fn()
}));

describe("updateAssetTypeService", () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lanza error si ID inválido", async () => {

    await expect(
      updateAssetTypeService("abc", {})
    ).rejects.toThrow("ID inválido");

  });

  it("lanza error si no existe el asset type", async () => {

    getAssetTypeByIdRepository.mockResolvedValue(null);

    await expect(
      updateAssetTypeService(1, { name: "Laptop" })
    ).rejects.toThrow("Tipo de asset no encontrado");

  });

  it("actualiza correctamente el asset type", async () => {

    const existing = { id: 1, name: "Old" };
    const updated = { id: 1, name: "Laptop", description: "Equipo" };

    getAssetTypeByIdRepository.mockResolvedValue(existing);
    updateAssetTypeRepository.mockResolvedValue(updated);

    const result = await updateAssetTypeService(1, {
      name: "Laptop",
      description: "Equipo"
    });

    expect(updateAssetTypeRepository)
      .toHaveBeenCalledWith(existing, {
        name: "Laptop",
        description: "Equipo"
      });

    expect(result).toEqual(updated);

  });

});