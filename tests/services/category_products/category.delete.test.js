import { describe, it, expect, vi } from 'vitest';
import { deleteCategoryProduct } from '@/services/category_products.js';
import * as repo from '@/repositories/category_products.js';

vi.mock('@/repositories/category_products.js');

describe('deleteCategoryProduct', () => {

  it('debe eliminar una categoría sin dependencias', async () => {
    repo.getCategoryProductByIdRepository.mockResolvedValue({ id: 1 });
    repo.hasCategoryChildrenRepository.mockResolvedValue(false);
    repo.hasProductsInCategoryRepository.mockResolvedValue(false);
    repo.deleteCategoryProductRepository.mockResolvedValue();

    await expect(deleteCategoryProduct(1)).resolves.not.toThrow();
  });

  it('debe impedir eliminar si tiene subcategorías', async () => {
    repo.getCategoryProductByIdRepository.mockResolvedValue({ id: 1 });
    repo.hasCategoryChildrenRepository.mockResolvedValue(true);

    await expect(deleteCategoryProduct(1))
      .rejects.toThrow('No se puede eliminar la categoria de producto porque tiene subcategorias asociadas');
  });

  it('debe impedir eliminar si tiene productos', async () => {
    repo.getCategoryProductByIdRepository.mockResolvedValue({ id: 1 });
    repo.hasCategoryChildrenRepository.mockResolvedValue(false);
    repo.hasProductsInCategoryRepository.mockResolvedValue(true);

    await expect(deleteCategoryProduct(1))
      .rejects.toThrow('No se puede eliminar la categoria de producto porque tiene productos asociados');
  });
});