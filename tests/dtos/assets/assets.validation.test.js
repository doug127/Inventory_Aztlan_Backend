import { describe, it, expect } from "vitest";
import { assetsDTO } from "@/dtos/assets.js";

describe("assetsDTO.validate", () => {

  it("valida correctamente un name válido", () => {

    const dto = new assetsDTO({ name: "Laptop" });
    const result = dto.validate();

    expect(result).toEqual({ name: "Laptop" });

  });

  it("lanza error si name es obligatorio", () => {

    const dto = new assetsDTO({});

    expect(() => dto.validate())
      .toThrow("El campo 'name' es obligatorio");

  });

  it("lanza error si name no es string", () => {

    const dto = new assetsDTO({ name: 123 });

    expect(() => dto.validate())
      .toThrow("El campo 'name' debe ser un texto");

  });

  it("lanza error si name está vacío", () => {

    const dto = new assetsDTO({ name: "   " });

    expect(() => dto.validate())
      .toThrow("El campo 'name' no puede estar vacío");

  });

  it("lanza error si name supera 20 caracteres", () => {

    const dto = new assetsDTO({
      name: "A".repeat(21)
    });

    expect(() => dto.validate())
      .toThrow("El campo 'name' no puede superar 20 caracteres");

  });

});