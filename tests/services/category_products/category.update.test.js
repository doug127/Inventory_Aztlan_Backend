import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateCategoryProduct } from '@/services/category_products.js';
import * as repo from '@/repositories/category_products.js';

vi.mock('@/repositories/category_products.js');

describe('updateCategoryProduct', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  
  it('debe impedir asignar una categoría hija como padre', async () => {

    const mockCalls = [
      { id: 1, name: 'parent', parent_id: null },
      { id: 2, name: 'child1', parent_id: 1 },
      { id: 1, name: 'parent', parent_id: null }
    ];

    repo.getCategoryProductByIdRepository.mockImplementation(() => { 
      return Promise.resolve(mockCalls.shift() || null);
    });

    const descendantCalls = [
      [{ id: 3, name: 'child', parent_id: 1 }],
      []
    ]

    repo.getAllDescendantsRepository.mockImplementation(() => {
      return Promise.resolve(descendantCalls.shift() || []);
    });

    await expect(
      updateCategoryProduct(1, { parent_id: 3 })
    ).rejects.toThrow('No se puede asignar una categoría hija como padre');
  });

  it('debe lanzar error si intenta ser padre de sí misma', async () => {
    repo.getCategoryProductByIdRepository
      .mockResolvedValue({ 
        id: 1, 
        name: 'test', 
        parent_id: null 
      });

    await expect(
      updateCategoryProduct(1, { parent_id: 1 })
    ).rejects.toThrow('Una categoría no puede ser padre de sí misma');
  });
});