import { describe, it, expect } from 'vitest';
import { UnitDTO } from '@/dtos/unit.js';

describe('UnitDTO.validate', () => {

  const validData = {
    name: 'Kilogramo',
    code: 'Kg',
    is_active: true,
    base_unit_id: null,
    conversion_factor: 1
  };

  it('no lanza error si los datos son válidos', () => {
    const dto = new UnitDTO(validData);
    expect(() => dto.validate()).not.toThrow();
  });

  // 🔤 NAME
  it('lanza error si el nombre está vacío', () => {
    const dto = new UnitDTO({ ...validData, name: '' });
    expect(() => dto.validate())
      .toThrow('El nombre de la unidad debe tener entre 3 y 50 caracteres');
  });

  it('lanza error si el nombre es muy corto', () => {
    const dto = new UnitDTO({ ...validData, name: 'AB' });
    expect(() => dto.validate()).toThrow();
  });

  it('lanza error si el nombre tiene espacios dobles', () => {
    const dto = new UnitDTO({ ...validData, name: 'Kilo  gramo' });
    expect(() => dto.validate())
      .toThrow('El nombre de la unidad no debe contener espacios dobles');
  });

  it('lanza error si el nombre tiene caracteres inválidos', () => {
    const dto = new UnitDTO({ ...validData, name: 'Kilo@gramo' });
    expect(() => dto.validate())
      .toThrow('El nombre de la unidad solo debe contener letras, números y espacios');
  });

  // 🔡 CODE
  it('lanza error si el código está vacío', () => {
    const dto = new UnitDTO({ ...validData, code: '' });
    expect(() => dto.validate())
      .toThrow('El código de la unidad debe tener entre 1 y 4 caracteres');
  });

  it('lanza error si el código tiene más de 4 caracteres', () => {
    const dto = new UnitDTO({ ...validData, code: 'ABCDE' });
    expect(() => dto.validate()).toThrow();
  });

  it('lanza error si el código tiene espacios', () => {
    const dto = new UnitDTO({ ...validData, code: 'K G' });
    expect(() => dto.validate())
      .toThrow('El código de la unidad no debe contener espacios');
  });

  // 🔘 IS_ACTIVE
  it('lanza error si is_active no es booleano', () => {
    const dto = new UnitDTO({ ...validData, is_active: 'true' });
    expect(() => dto.validate())
      .toThrow('El campo is_active debe ser un booleano');
  });

  // 🔗 BASE UNIT ID
  it('lanza error si base_unit_id es negativo', () => {
    const dto = new UnitDTO({ ...validData, base_unit_id: -1 });
    expect(() => dto.validate())
      .toThrow('El ID de la unidad base debe ser un número positivo o nulo');
  });

  it('lanza error si base_unit_id no es número', () => {
    const dto = new UnitDTO({ ...validData, base_unit_id: 'abc' });
    expect(() => dto.validate()).toThrow();
  });

  // 🔢 CONVERSION FACTOR
  it('lanza error si conversion_factor no es número', () => {
    const dto = new UnitDTO({ ...validData, conversion_factor: '1' });
    expect(() => dto.validate())
      .toThrow('El factor de conversión debe ser un número positivo');
  });

  it('lanza error si conversion_factor es 0', () => {
    const dto = new UnitDTO({ ...validData, conversion_factor: 0 });
    expect(() => dto.validate()).toThrow();
  });

});
