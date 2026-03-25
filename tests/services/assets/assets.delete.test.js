import { describe, it, expect, vi, beforeEach } from "vitest";
import { deleteAssetService } from "@/services/assets.js";
import {
  getAssetByIdRepository,
  deleteAssetRepository
} from "@/repositories/assets.js";

vi.mock("@/repositories/assets.js", () => ({
  getAssetByIdRepository: vi.fn(),
  deleteAssetRepository: vi.fn()
}));

describe("deleteAssetService", () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lanza error si ID inválido", async () => {

    await expect(
      deleteAssetService("abc")
    ).rejects.toThrow("ID inválido");

  });

  it("lanza error si el asset no existe", async () => {

    getAssetByIdRepository.mockResolvedValue(null);

    await expect(
      deleteAssetService(1)
    ).rejects.toThrow("Activo no encontrado");

  });

  it("elimina correctamente el asset", async () => {

    const asset = { id: 1, name: "Laptop" };

    getAssetByIdRepository.mockResolvedValue(asset);
    deleteAssetRepository.mockResolvedValue(true);

    const result = await deleteAssetService(1);

    expect(deleteAssetRepository)
      .toHaveBeenCalledWith(asset);

    expect(result).toBe(true);

  });

});