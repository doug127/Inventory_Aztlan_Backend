import { describe, it, expect, vi, beforeEach } from "vitest";
import { deleteReasonService } from "@/services/reasons.js";
import {
  getReasonByIdRepository,
  deleteReasonRepository
} from "@/repositories/reasons.js";

vi.mock("@/repositories/reasons.js", () => ({
  getReasonByIdRepository: vi.fn(),
  deleteReasonRepository: vi.fn()
}));

describe("deleteReasonService", () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lanza error si id inválido", async () => {

    await expect(
      deleteReasonService("abc")
    ).rejects.toThrow("ID inválido");

  });

  it("lanza error si la razón no existe", async () => {

    getReasonByIdRepository.mockResolvedValue(null);

    await expect(
      deleteReasonService(1)
    ).rejects.toThrow("Razón no encontrada");

  });

  it("elimina correctamente la razón", async () => {

    const reason = {
      id: 1,
      type: "Rotura"
    };

    getReasonByIdRepository.mockResolvedValue(reason);
    deleteReasonRepository.mockResolvedValue();

    const result = await deleteReasonService(1);

    expect(deleteReasonRepository)
      .toHaveBeenCalledWith(reason);

    expect(result).toEqual({
      message: "Razón eliminada correctamente"
    });

  });

});