import { describe, it, expect } from 'vitest';
import { ProductDTO } from '@/dtos/product.js';

describe('ProductDTO.validate', () => {

  const validData = {
    name: 'Producto 1',
    code: 'PROD1',
    content_quantity: 10,
    min_stock: 1,
    max_stock: 20,
    unit_id: 1,
    product_category_id: 1
  };

  it('no lanza error con datos válidos', () => {
    const dto = new ProductDTO(validData);
    expect(() => dto.validate()).not.toThrow();
  });

  it('lanza error si falta el nombre', () => {
    const dto = new ProductDTO({ ...validData, name: null });
    expect(() => dto.validate()).toThrow('El nombre del producto es requerido');
  });

  it('lanza error si el código tiene espacios', () => {
    const dto = new ProductDTO({ ...validData, code: 'PROD 1' });
    expect(() => dto.validate()).toThrow('El código del producto no puede contener espacios');
  });

  it('lanza error si content_quantity es negativa', () => {
    const dto = new ProductDTO({ ...validData, content_quantity: -1 });
    expect(() => dto.validate()).toThrow('La cantidad de contenido debe ser un número positivo');
  });

  it('lanza error si min_stock >= max_stock', () => {
    const dto = new ProductDTO({ ...validData, min_stock: 10, max_stock: 10 });
    expect(() => dto.validate()).toThrow('El stock mínimo no puede ser mayor o igual al stock máximo');
  });

  it('lanza error si unit_id es inválido', () => {
    const dto = new ProductDTO({ ...validData, unit_id: -1 });
    expect(() => dto.validate()).toThrow('El ID de la unidad debe ser un número positivo');
  });

  it('lanza error si product_category_id es inválido', () => {
    const dto = new ProductDTO({ ...validData, product_category_id: 0 });
    expect(() => dto.validate()).toThrow('El ID de la categoría del producto debe ser un número positivo');
  });

});