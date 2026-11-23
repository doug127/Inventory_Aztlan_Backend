import { describe, it, expect, vi, beforeEach } from 'vitest';
import { increaseStockService } from '@/services/stock.js';
import {
  findStockForUpdateRepository,
  createStockRepository,
  updateStockRepository
} from '@/repositories/stock.js';

vi.mock('@/repositories/stock.js', () => ({
  findStockForUpdateRepository: vi.fn(),
  createStockRepository: vi.fn(),
  updateStockRepository: vi.fn()
}));

vi.mock('@/models', () => ({
  Stock: {
    sequelize: {
      transaction: vi.fn((cb) => cb({})) // ejecuta la callback simulando transaction
    }
  }
}));

describe('increaseStockService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lanza error si amount <= 0', async () => {
    await expect(
      increaseStockService({ product_id: 1, warehouse_id: 1, amount: 0 })
    ).rejects.toThrow('La cantidad a incrementar debe ser mayor que cero');
  });

  it('crea stock si no existe', async () => {
    findStockForUpdateRepository.mockResolvedValue(null);
    createStockRepository.mockResolvedValue({ quantity: 10 });

    const result = await increaseStockService({
      product_id: 1,
      warehouse_id: 1,
      amount: 10
    });

    expect(createStockRepository).toHaveBeenCalledWith(
      { product_id: 1, warehouse_id: 1, amount: 10 },
      {}
    );

    expect(result).toEqual({
      message: 'Stock creado exitosamente',
      quantity: 10
    });
  });

  it('incrementa stock si ya existe', async () => {
    findStockForUpdateRepository.mockResolvedValue({ quantity: 5 });

    const result = await increaseStockService({
      product_id: 1,
      warehouse_id: 1,
      amount: 3
    });

    expect(updateStockRepository).toHaveBeenCalledWith(
      { quantity: 5 },
      8,
      {}
    );

    expect(result).toEqual({
      message: 'Stock incrementado exitosamente',
      quantity: 8
    });
  });
});