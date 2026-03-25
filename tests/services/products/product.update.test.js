import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateProductService } from '@/services/product.js';
import {
  getProductByIdRepository,
  updateProductRepository
} from '@/repositories/product.js';

vi.mock('@/repositories/product.js', () => ({
  getProductByIdRepository: vi.fn(),
  updateProductRepository: vi.fn()
}));

describe('updateProductService', () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validData = {
    name: 'Producto actualizado'
  };

  it('lanza error si el producto no existe', async () => {
    getProductByIdRepository.mockResolvedValue(null);

    await expect(updateProductService(1, validData))
      .rejects.toThrow('Producto no encontrado');

    expect(updateProductRepository).not.toHaveBeenCalled();
  });

  it('actualiza el producto correctamente', async () => {
    getProductByIdRepository.mockResolvedValue({ id: 1 });
    updateProductRepository.mockResolvedValue({ id: 1, ...validData });

    const result = await updateProductService(1, validData);

    expect(updateProductRepository).toHaveBeenCalledWith(1, validData);
    expect(result).toEqual({ id: 1, ...validData });
  });

});