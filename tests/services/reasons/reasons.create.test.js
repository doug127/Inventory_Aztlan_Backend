import { describe, it, expect, vi, beforeEach } from "vitest";
import { createReasonService } from "@/services/reasons.js";
import { createReasonRepository } from "@/repositories/reasons.js";

vi.mock("@/repositories/reasons.js", () => ({
  createReasonRepository: vi.fn()
}));

describe("createReasonService", () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("crea una razón correctamente", async () => {

    const mockReason = {
      id: 1,
      type: "Rotura"
    };

    createReasonRepository.mockResolvedValue(mockReason);

    const result = await createReasonService({
      type: "Rotura"
    });

    expect(createReasonRepository).toHaveBeenCalledWith({
      type: "Rotura"
    });

    expect(result).toEqual({
      data: mockReason
    });

  });

});