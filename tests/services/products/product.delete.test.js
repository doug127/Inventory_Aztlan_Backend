import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deleteProductService } from '@/services/product.js';
import {
  getProductByIdRepository,
  deleteProductRepository
} from '@/repositories/product.js';

vi.mock('@/repositories/product.js', () => ({
  getProductByIdRepository: vi.fn(),
  deleteProductRepository: vi.fn()
}));

describe('deleteProductService', () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lanza error si el producto no existe', async () => {
    getProductByIdRepository.mockResolvedValue(null);

    await expect(deleteProductService(1))
      .rejects.toThrow('Producto no encontrado');

    expect(deleteProductRepository).not.toHaveBeenCalled();
  });

  it('elimina el producto correctamente', async () => {
    getProductByIdRepository.mockResolvedValue({ id: 1 });
    deleteProductRepository.mockResolvedValue(true);

    const result = await deleteProductService(1);

    expect(deleteProductRepository).toHaveBeenCalledWith(1);
    expect(result).toBe(true);
  });

});