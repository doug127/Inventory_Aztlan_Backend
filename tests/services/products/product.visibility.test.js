import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAllProductsService, getProductByIdService, getAllByFilterProductsService } from '#src/modules/product/product.service.js';
import { getAllProductsRepository, getProductByIdRepository, getAllByFilterProductsRepository } from '#src/modules/product/product.repository.js';

vi.mock('#src/modules/product/product.repository.js', () => ({
  getAllProductsRepository: vi.fn(),
  getProductByIdRepository: vi.fn(),
  getAllByFilterProductsRepository: vi.fn(),
  getProductByNameRepository: vi.fn(),
  getProductByCodeRepository: vi.fn(),
  getProductByUnitIdRepository: vi.fn(),
  createProductRepository: vi.fn(),
  updateProductRepository: vi.fn(),
  deleteProductRepository: vi.fn()
}));

vi.mock('#src/modules/product/unit/unit.repository.js', () => ({
  getUnitByIdRepository: vi.fn()
}));

describe('product visibility by hierarchy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('filters inactive products for non-superadmin users', async () => {
    getAllProductsRepository.mockResolvedValue([
      {
        get: () => ({
          id: 1,
          name: 'Producto 1',
          code: 'P1',
          content_quantity: 1,
          min_stock: 1,
          max_stock: 5,
          is_active: true,
          unit: null,
          category_product: null
        })
      }
    ]);

    await getAllProductsService({ hierarchy_level: 2 });

    expect(getAllProductsRepository).toHaveBeenCalledWith({ includeInactive: false });
  });

  it('lets superadmin users include inactive products', async () => {
    getAllProductsRepository.mockResolvedValue([
      {
        get: () => ({
          id: 2,
          name: 'Producto 2',
          code: 'P2',
          content_quantity: 2,
          min_stock: 2,
          max_stock: 10,
          is_active: false,
          unit: null,
          category_product: null
        })
      }
    ]);

    await getAllProductsService({ hierarchy_level: 3 });

    expect(getAllProductsRepository).toHaveBeenCalledWith({ includeInactive: true });
  });

  it('hides inactive products by id for non-superadmin users', async () => {
    getProductByIdRepository.mockResolvedValue({
      id: 3,
      name: 'Producto 3',
      code: 'P3',
      content_quantity: 3,
      min_stock: 3,
      max_stock: 12,
      is_active: false,
      unit: null,
      category_product: null
    });

    await expect(getProductByIdService(3, { hierarchy_level: 2 })).rejects.toThrow('Producto no encontrado');
  });

  it('passes the visibility flag to filtered queries', async () => {
    getAllByFilterProductsRepository.mockResolvedValue({ rows: [], count: 0 });

    await getAllByFilterProductsService({ page: 1, limit: 10 }, { hierarchy_level: 1 });

    expect(getAllByFilterProductsRepository).toHaveBeenCalledWith(expect.objectContaining({ includeInactive: false }));
  });
});
