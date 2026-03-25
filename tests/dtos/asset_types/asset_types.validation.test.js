import { describe, it, expect } from "vitest";
import { assetTypesDTO } from "@/dtos/asset_types.js";

describe("assetTypesDTO.validate", () => {

  const validData = {
    name: "Laptop",
    description: "Equipo de trabajo"
  };

  it("valida correctamente datos válidos", () => {

    const dto = new assetTypesDTO(validData);
    const result = dto.validate();

    expect(result).toEqual({
      name: "Laptop",
      description: "Equipo de trabajo"
    });

  });

  it("lanza error si name no existe", () => {

    const dto = new assetTypesDTO({});

    expect(() => dto.validate())
      .toThrow("El campo 'name' es obligatorio");

  });

  it("lanza error si name no es string", () => {

    const dto = new assetTypesDTO({
      name: 123,
      description: "test"
    });

    expect(() => dto.validate())
      .toThrow("El campo 'name' debe ser un texto");

  });

  it("lanza error si name está vacío", () => {

    const dto = new assetTypesDTO({
      name: "   ",
      description: "test"
    });

    expect(() => dto.validate())
      .toThrow("El campo 'name' no puede estar vacío");

  });

  it("lanza error si name supera 20 caracteres", () => {

    const dto = new assetTypesDTO({
      name: "A".repeat(21),
      description: "test"
    });

    expect(() => dto.validate())
      .toThrow("El campo 'name' no puede superar 20 caracteres");

  });

  it("lanza error si description supera 50 caracteres", () => {

    const dto = new assetTypesDTO({
      name: "Laptop",
      description: "A".repeat(51)
    });

    expect(() => dto.validate())
      .toThrow("El campo descripción no puede superar 50 caracteres");

  });

});