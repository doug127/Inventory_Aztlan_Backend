import { describe, it, expect } from 'vitest';
import { MovementTypesDTO } from '@/dtos/movement_types.js';

describe('MovementTypesDTO.validate', () => {

  const validData = {
    type: 'entrada'
  };

  it('no lanza error con datos válidos', () => {
    const dto = new MovementTypesDTO(validData);
    const result = dto.validate();

    expect(result).toEqual({ type: 'ENTRADA' });
  });

  it('lanza error si type no existe', () => {
    const dto = new MovementTypesDTO({});
    expect(() => dto.validate())
      .toThrow("El campo 'type' es obligatorio");
  });

  it('lanza error si type no es string', () => {
    const dto = new MovementTypesDTO({ type: 123 });
    expect(() => dto.validate())
      .toThrow("El campo 'type' debe ser un texto");
  });

  it('lanza error si type está vacío', () => {
    const dto = new MovementTypesDTO({ type: '   ' });
    expect(() => dto.validate())
      .toThrow("El campo 'type' no puede estar vacío");
  });

  it('lanza error si type supera 50 caracteres', () => {
    const dto = new MovementTypesDTO({
      type: 'A'.repeat(51)
    });

    expect(() => dto.validate())
      .toThrow("El campo 'type' no puede superar 50 caracteres");
  });

});