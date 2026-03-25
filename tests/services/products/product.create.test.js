import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createProductService } from '@/services/product.js';
import { createProductRepository } from '@/repositories/product.js';

vi.mock('@/repositories/product.js', () => ({
  createProductRepository: vi.fn()
}));

describe('createProductService', () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validData = {
    name: 'Producto 1',
    code: 'PROD1',
    content_quantity: 10,
    min_stock: 1,
    max_stock: 20,
    unit_id: 1,
    product_category_id: 1
  };

  it('crea un producto correctamente', async () => {
    createProductRepository.mockResolvedValue({ id: 1 });

    const result = await createProductService(validData);

    expect(createProductRepository).toHaveBeenCalledWith(validData);
    expect(result).toEqual({ id: 1 });
  });

  it('lanza error si los datos son inválidos', async () => {
    const invalidData = { ...validData, name: null };

    await expect(createProductService(invalidData))
      .rejects.toThrow('El nombre del producto es requerido');

    expect(createProductRepository).not.toHaveBeenCalled();
  });

});