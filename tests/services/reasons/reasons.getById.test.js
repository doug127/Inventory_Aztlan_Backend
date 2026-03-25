import { describe, it, expect, vi, beforeEach } from "vitest";
import { getReasonByIdService } from "@/services/reasons.js";
import { getReasonByIdRepository } from "@/repositories/reasons.js";

vi.mock("@/repositories/reasons.js", () => ({
  getReasonByIdRepository: vi.fn()
}));

describe("getReasonByIdService", () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lanza error si id es inválido", async () => {

    await expect(
      getReasonByIdService("abc")
    ).rejects.toThrow("ID inválido");

  });

  it("lanza error si la razón no existe", async () => {

    getReasonByIdRepository.mockResolvedValue(null);

    await expect(
      getReasonByIdService(1)
    ).rejects.toThrow("Razón no encontrada");

  });

  it("retorna la razón correctamente", async () => {

    const mockReason = {
      id: 1,
      type: "Rotura"
    };

    getReasonByIdRepository.mockResolvedValue(mockReason);

    const result = await getReasonByIdService(1);

    expect(result).toEqual({
      data: mockReason
    });

  });

});