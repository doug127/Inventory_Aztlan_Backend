import { describe, it, expect, vi } from 'vitest';
import { getCategoryAncestors } from '@/services/category_products.js';
import * as repo from '@/repositories/category_products.js';

vi.mock('@/repositories/category_products.js');

describe('getCategoryAncestors', () => {

  it('debe devolver la cadena de padres ordenada', async () => {
    repo.getCategoryProductByIdRepository
      .mockResolvedValueOnce({ id: 3, parent_id: 2 }) // initial
      .mockResolvedValueOnce({ id: 2, name: 'abonos', parent_id: 1 })
      .mockResolvedValueOnce({ id: 1, name: 'quimicos', parent_id: null });

    const result = await getCategoryAncestors(3);

    expect(result.map(c => c.name)).toEqual(['quimicos', 'abonos']);
  });

  it('debe lanzar error si la categoria no existe', async () => {
    repo.getCategoryProductByIdRepository.mockResolvedValue(null);

    await expect(getCategoryAncestors(99))
      .rejects.toThrow('Categoria de producto no encontrada');
  });

  it('debe detectar ciclos', async () => {
    repo.getCategoryProductByIdRepository
      .mockResolvedValueOnce({ id: 3, name: 'cat3', parent_id: 2 })
      .mockResolvedValueOnce({ id: 2, name: 'cat2', parent_id: 3 })
      .mockResolvedValueOnce({ id: 3, name: 'cat3', parent_id: 2 });

    await expect(getCategoryAncestors(3))
      .rejects.toThrow('Ciclo detectado en la jerarquía de categorías');
  });
});
