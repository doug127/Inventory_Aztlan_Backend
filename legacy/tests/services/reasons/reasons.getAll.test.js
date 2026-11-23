import { describe, it, expect, vi, beforeEach } from "vitest";
import { getAllReasonsService } from "@/services/reasons.js";
import { getAllReasonsRepository } from "@/repositories/reasons.js";

vi.mock("@/repositories/reasons.js", () => ({
  getAllReasonsRepository: vi.fn()
}));

describe("getAllReasonsService", () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna todas las razones", async () => {

    const mockReasons = [
      { id: 1, type: "Rotura" },
      { id: 2, type: "Ajuste inventario" }
    ];

    getAllReasonsRepository.mockResolvedValue(mockReasons);

    const result = await getAllReasonsService();

    expect(result).toEqual({
      data: mockReasons
    });

    expect(getAllReasonsRepository).toHaveBeenCalled();

  });

});