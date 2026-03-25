import { describe, it, expect, vi, beforeEach } from "vitest";
import { updateAssetService } from "@/services/assets.js";
import {
  getAssetByIdRepository,
  updateAssetRepository
} from "@/repositories/assets.js";

vi.mock("@/repositories/assets.js", () => ({
  getAssetByIdRepository: vi.fn(),
  updateAssetRepository: vi.fn()
}));

describe("updateAssetService", () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lanza error si ID es inválido", async () => {

    await expect(
      updateAssetService("abc", { name: "Laptop" })
    ).rejects.toThrow("ID inválido");

  });

  it("lanza error si asset no existe", async () => {

    getAssetByIdRepository.mockResolvedValue(null);

    await expect(
      updateAssetService(1, { name: "Laptop" })
    ).rejects.toThrow("Activo no encontrado");

  });

  it("lanza error si DTO falla", async () => {

    getAssetByIdRepository.mockResolvedValue({ id: 1 });

    await expect(
      updateAssetService(1, { name: "" })
    ).rejects.toThrow("El campo 'name' no puede estar vacío");

  });

  it("actualiza correctamente el asset", async () => {

    const existing = { id: 1, name: "Old" };
    const updated = { id: 1, name: "Laptop" };

    getAssetByIdRepository.mockResolvedValue(existing);
    updateAssetRepository.mockResolvedValue(updated);

    const result = await updateAssetService(1, {
      name: "Laptop"
    });

    expect(updateAssetRepository)
      .toHaveBeenCalledWith(existing, { name: "Laptop" });

    expect(result).toEqual(updated);

  });

});