import { describe, it, expect } from 'vitest';
import { validateWarehouseData } from '@/dtos/warehouse.js';

describe('validateWarehouseData', () => {

  const validData = { name: 'Almacen1', code: 'ABCD', existingWarehouse: false };

  it('lanza error si el almacén ya existe', () => {
    expect(() => validateWarehouseData({ ...validData, existingWarehouse: true }))
      .toThrow('Ya existe un almacen con ese nombre');
  });

  const invalidNames = [
    { name: 'AB', msg: 'entre 3 y 50 caracteres' },
    { name: 'A'.repeat(51), msg: 'entre 3 y 50 caracteres' },
    { name: 'Alm@cen!', msg: 'solo puede contener letras, numeros y espacios' }
  ];

  invalidNames.forEach(({ name, msg }) => {
    it(`lanza error si el nombre es inválido: "${name}"`, () => {
      expect(() => validateWarehouseData({ ...validData, name }))
        .toThrow(msg);
    });
  });

  const invalidCodes = [
    { code: 'ab12', msg: '4 caracteres alfanumericos en mayusculas' },
    { code: 'A B1', msg: 'no puede contener espacios' },
    { code: 'ABCDE', msg: 'exactamente 4 caracteres' },
    { code: 'A1', msg: 'exactamente 4 caracteres' },
    { code: 'AB$1', msg: '4 caracteres alfanumericos en mayusculas' }
  ];

  invalidCodes.forEach(({ code, msg }) => {
    it(`lanza error si el código es inválido: "${code}"`, () => {
      expect(() => validateWarehouseData({ ...validData, code }))
        .toThrow(msg);
    });
  });

  it('no lanza error si los datos son válidos', () => {
    expect(() => validateWarehouseData(validData)).not.toThrow();
  });

});
