import { describe, it, expect, vi, beforeEach } from "vitest";
import { updateReasonService } from "@/services/reasons.js";
import {
  getReasonByIdRepository,
  updateReasonRepository
} from "@/repositories/reasons.js";

vi.mock("@/repositories/reasons.js", () => ({
  getReasonByIdRepository: vi.fn(),
  updateReasonRepository: vi.fn()
}));

describe("updateReasonService", () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lanza error si id inválido", async () => {

    await expect(
      updateReasonService("abc", { type: "Rotura" })
    ).rejects.toThrow("ID inválido");

  });

  it("lanza error si la razón no existe", async () => {

    getReasonByIdRepository.mockResolvedValue(null);

    await expect(
      updateReasonService(1, { type: "Rotura" })
    ).rejects.toThrow("Razón no encontrada");

  });

  it("actualiza correctamente la razón", async () => {

    const existingReason = {
      id: 1,
      type: "Rotura"
    };

    const updatedReason = {
      id: 1,
      type: "Ajuste inventario"
    };

    getReasonByIdRepository.mockResolvedValue(existingReason);
    updateReasonRepository.mockResolvedValue(updatedReason);

    const result = await updateReasonService(1, {
      type: "Ajuste inventario"
    });

    expect(updateReasonRepository)
      .toHaveBeenCalledWith(existingReason, { type: "Ajuste inventario" });

    expect(result).toEqual({
      data: updatedReason
    });

  });

});