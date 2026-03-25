import { describe, it, expect } from "vitest";
import { ReasonsDTO } from "@/dtos/reasons.js";

describe("ReasonsDTO.validate", () => {

  const validData = {
    type: "Rotura de producto"
  };

  it("no lanza error con datos válidos", () => {

    const dto = new ReasonsDTO(validData);
    const result = dto.validate();

    expect(result).toEqual({
      type: "Rotura de producto"
    });

  });

  it("lanza error si type no existe", () => {

    const dto = new ReasonsDTO({});

    expect(() => dto.validate())
      .toThrow("El campo 'type' es obligatorio");

  });

  it("lanza error si type no es string", () => {

    const dto = new ReasonsDTO({
      type: 123
    });

    expect(() => dto.validate())
      .toThrow("El campo 'type' debe ser un texto");

  });

  it("lanza error si type está vacío", () => {

    const dto = new ReasonsDTO({
      type: "   "
    });

    expect(() => dto.validate())
      .toThrow("El campo 'type' no puede estar vacío");

  });

  it("lanza error si supera 100 caracteres", () => {

    const dto = new ReasonsDTO({
      type: "A".repeat(101)
    });

    expect(() => dto.validate())
      .toThrow("El campo 'type' no puede superar 100 caracteres");

  });

});