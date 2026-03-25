import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCategoryProduct } from '@/services/category_products.js';

import * as repository from '@/repositories/category_products.js';

vi.mock('@/repositories/category_products.js');

describe('createCategoryProduct service', () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('debe crear una categoría sin parent_id', async () => {
    repository.getCategoryProductByNameRepository.mockResolvedValue(null);
    repository.createCategoryProductRepository.mockResolvedValue({
      id: 1,
      name: 'quimicos'
    });

    const result = await createCategoryProduct({
      name: 'Quimicos',
      description: 'Productos químicos'
    });

    expect(result.name).toBe('quimicos');
    expect(repository.createCategoryProductRepository).toHaveBeenCalled();
  });

  it('debe lanzar error si el nombre ya existe', async () => {
    repository.getCategoryProductByNameRepository.mockResolvedValue({ id: 1 });

    await expect(
      createCategoryProduct({ name: 'quimicos' })
    ).rejects.toThrow('Ya existe una categoria de producto con ese nombre');
  });

  it('debe validar que el parent exista', async () => {
    repository.getCategoryProductByNameRepository.mockResolvedValue(null);
    repository.getCategoryProductByIdRepository.mockResolvedValue(null);

    await expect(
      createCategoryProduct({ name: 'abonos', parent_id: 99 })
    ).rejects.toThrow('Categoria padre no encontrada');
  });
});
