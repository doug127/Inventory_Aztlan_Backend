import { describe, it, expect, vi, beforeEach } from 'vitest';
import { decreaseStockService } from '@/services/stock.js';
import {
  findStockForUpdateRepository,
  updateStockRepository
} from '@/repositories/stock.js';

vi.mock('@/repositories/stock.js', () => ({
  findStockForUpdateRepository: vi.fn(),
  updateStockRepository: vi.fn()
}));

vi.mock('@/models/index.js', () => ({
  Stock: {
    sequelize: {
      transaction: vi.fn((cb) => cb({}))
    }
  }
}));

describe('decreaseStockService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lanza error si amount <= 0', async () => {
    await expect(
      decreaseStockService({ product_id: 1, warehouse_id: 1, amount: 0 })
    ).rejects.toThrow('La cantidad a decrementar debe ser mayor que cero');
  });

  it('lanza error si el stock no existe', async () => {
    findStockForUpdateRepository.mockResolvedValue(null);

    await expect(
      decreaseStockService({ product_id: 1, warehouse_id: 1, amount: 5 })
    ).rejects.toThrow('No existe stock para el producto y almacén especificados');
  });

  it('lanza error si el stock es insuficiente', async () => {
    findStockForUpdateRepository.mockResolvedValue({ quantity: 3 });

    await expect(
      decreaseStockService({ product_id: 1, warehouse_id: 1, amount: 5 })
    ).rejects.toThrow('Stock insuficiente');
  });

  it('decrementa stock correctamente', async () => {
    findStockForUpdateRepository.mockResolvedValue({ quantity: 10 });

    const result = await decreaseStockService({
      product_id: 1,
      warehouse_id: 1,
      amount: 4
    });

    expect(updateStockRepository).toHaveBeenCalledWith(
      { quantity: 10 },
      6,
      {}
    );

    expect(result).toEqual({
      message: 'Stock decrementado exitosamente',
      quantity: 6
    });
  });
});