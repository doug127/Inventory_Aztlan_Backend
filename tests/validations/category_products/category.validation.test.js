import { describe, it, expect } from 'vitest';
import { validateCategoryProductData } from '@/dtos/category_products.js';

describe('validateCategoryProductData', () => {

  it('debe lanzar error si name no existe', () => {
    expect(() =>
      validateCategoryProductData({ name: null })
    ).toThrow('El nombre de la categoria de producto es obligatorio');
  });

  it('debe lanzar error si name está vacío', () => {
    expect(() =>
      validateCategoryProductData({ name: '   ' })
    ).toThrow('El nombre de la categoria de producto es obligatorio');
  });

  it('debe lanzar error si la categoria ya existe', () => {
    expect(() =>
      validateCategoryProductData({
        name: 'quimicos',
        existingCategory: { id: 1 }
      })
    ).toThrow('Ya existe una categoria de producto con ese nombre');
  });

  it('debe lanzar error si description excede 255 caracteres', () => {
    expect(() =>
      validateCategoryProductData({
        name: 'quimicos',
        description: 'a'.repeat(256)
      })
    ).toThrow('La descripcion no puede exceder los 255 caracteres');
  });

  it('no debe lanzar error con datos válidos', () => {
    expect(() =>
      validateCategoryProductData({
        name: 'quimicos',
        description: 'productos químicos'
      })
    ).not.toThrow();
  });
});