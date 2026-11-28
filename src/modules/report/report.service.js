// Reportes (Sprint 7). HU-501: consumo por activo y por categoría de activo, con el consumo neto.
// Servicio sin HTTP: lo reutilizará el asistente IA (HU-602).
import * as reportRepository from './report.repository.js';
import { getAsset } from '#src/modules/asset/asset.service.js';
import { getProduct } from '#src/modules/product/product.service.js';
import { getCategory as getAssetCategory, getSubtreeIds as getAssetSubtreeIds } from '#src/modules/asset/asset_category/asset_category.service.js';
import { getSubtreeIds as getProductSubtreeIds } from '#src/modules/product/product_category/product_category.service.js';
import { toConsumptionRowDto, toConsumptionSummaryDto } from './report.dto.js';

/**
 * Consumo neto (business_rules.md §5) en el período, por activo y producto o por categoría de activo y
 * producto. Las categorías incluyen sus subcategorías: assetCategoryId=LINEA_AMARILLA suma solo las
 * retroexcavadoras y los cargadores. Un producto, activo o categoría inexistente responde 404. Devuelve
 * el formato de sendPaginated con summary (totales por producto de todo el alcance).
 */
export const getConsumptionReport = async (query) => {
  const { groupBy, from, to, productId, productCategoryId, assetId, assetCategoryId, page, limit } = query;
  const [, , productCategoryIds, assetCategoryIds, assetCategory] = await Promise.all([
    productId && getProduct(productId),
    assetId && getAsset(assetId),
    productCategoryId && getProductSubtreeIds(productCategoryId),
    assetCategoryId && getAssetSubtreeIds(assetCategoryId),
    assetCategoryId && getAssetCategory(assetCategoryId),
  ]);
  const { items, total, products, groups, lines } = await reportRepository.findConsumption({
    groupBy,
    from,
    to,
    productId,
    productCategoryIds: productCategoryIds || undefined,
    assetId,
    assetCategoryId,
    assetCategoryIds: assetCategoryIds || undefined,
    page,
    limit,
  });
  return {
    items: items.map(toConsumptionRowDto),
    total,
    page,
    limit,
    filters: Object.fromEntries(
      Object.entries({ groupBy, from, to, productId, productCategoryId, assetId, assetCategoryId }).filter(([, v]) => v !== undefined)
    ),
    sort: { field: groupBy === 'asset' ? 'assetCode' : 'assetCategoryName', order: 'asc' },
    summary: toConsumptionSummaryDto({ groups, lines, products, assetCategory }),
  };
};
