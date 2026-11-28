// Exportación a Excel de los reportes (HU-503). Servicio sin HTTP: cada función llama al mismo service
// que la pantalla (con todas las páginas), así el archivo trae los mismos totales que se ven, y arma el
// libro con buildWorkbook. Devuelve { buffer, name, mimeType } para que el controller lo envíe.
// La exportación a PDF es la hoja imprimible del frontend ("Guardar como PDF").
import { buildWorkbook, collectAllPages, exportFileName, EXPORT_MAX_ROWS, XLSX_MIME_TYPE } from '#src/shared/export/workbook.js';
import { listStock, getKardex } from '#src/modules/stock/stock.service.js';
import { listMovements } from '#src/modules/movement/movement.service.js';
import { getWarehouse } from '#src/modules/warehouse/warehouse.service.js';
import { getProduct } from '#src/modules/product/product.service.js';
import { getAsset } from '#src/modules/asset/asset.service.js';
import { getCategory as getProductCategory } from '#src/modules/product/product_category/product_category.service.js';
import { getCategory as getAssetCategory } from '#src/modules/asset/asset_category/asset_category.service.js';
import { getConsumptionReport, getMovementsReport } from './report.service.js';

/** Etiquetas en español (naming_conventions.md §8.3), las mismas de la interfaz. */
const TYPE_LABELS = { IN: 'Entrada', OUT: 'Orden de retiro', TRANSFER: 'Traslado', ADJUST: 'Ajuste' };
const TYPE_PLURALS = { IN: 'Entradas', OUT: 'Órdenes de retiro', TRANSFER: 'Traslados', ADJUST: 'Ajustes' };
const REASON_LABELS = {
  COMPRA: 'Compra',
  DEVOLUCION: 'Devolución',
  CONSUMO: 'Consumo',
  PRESTAMO: 'Préstamo',
  DESECHO: 'Desecho',
  VENTA: 'Venta',
  TRASLADO: 'Traslado',
  AJUSTE: 'Ajuste',
  OTRO: 'Otro',
};
const STATUS_LABELS = { NORMAL: 'Normal', BAJO_MINIMO: 'Bajo el mínimo', SOBRE_MAXIMO: 'Sobre el máximo' };
const ALERT_LABELS = { BAJO_MINIMO: 'Bajo el mínimo', SOBRE_MAXIMO: 'Sobre el máximo', CON_ALERTA: 'Con alerta' };
const INTERVAL_LABELS = { day: 'Día', week: 'Semana', month: 'Mes' };
const TYPE_ORDER = ['IN', 'OUT', 'TRANSFER', 'ADJUST'];

const ref = (x) => (x ? `${x.code} · ${x.name}` : '');
const day = (value) => new Date(`${value}T12:00:00`).toLocaleDateString('es', { dateStyle: 'long' });
/** "Del 1 de noviembre de 2026 al 28 de noviembre de 2026", como en la pantalla. */
const periodLabel = ({ from, to }) =>
  from && to ? `Del ${day(from)} al ${day(to)}` : from ? `Desde el ${day(from)}` : to ? `Hasta el ${day(to)}` : 'Toda la historia';
const truncatedNote = (truncated) => (truncated ? `Se exportan las primeras ${EXPORT_MAX_ROWS.toLocaleString('es')} filas: acota los filtros para ver el resto.` : undefined);

const toFile = async (slug, workbook) => ({ buffer: await buildWorkbook(workbook), name: exportFileName(slug), mimeType: XLSX_MIME_TYPE });

/** Existencias por almacén y categoría (HU-407): el resumen por estado y todas las filas. */
export const exportStock = async (query, { actor } = {}) => {
  const { items, first, truncated } = await collectAllPages(listStock, query);
  const [warehouse, category] = await Promise.all([query.warehouseId && getWarehouse(query.warehouseId), query.categoryId && getProductCategory(query.categoryId)]);
  const byWarehouse = query.groupBy === 'warehouse';
  const s = first.summary;
  return toFile('existencias', {
    title: 'Existencias por almacén',
    generatedBy: actor?.username,
    filters: [
      { label: 'Vista', value: byWarehouse ? 'Por almacén' : 'Por producto' },
      { label: 'Almacén', value: warehouse ? ref(warehouse) : 'Todos' },
      { label: 'Categoría', value: category ? category.name : 'Todas' },
      { label: 'Estado', value: query.alert ? ALERT_LABELS[query.alert] : 'Todos' },
      ...(query.search ? [{ label: 'Búsqueda', value: query.search }] : []),
    ],
    sheets: [
      {
        name: 'Existencias',
        blocks: [
          {
            title: 'Productos por estado',
            columns: [
              { header: 'Normal', type: 'int', value: () => s.normal },
              { header: 'Bajo el mínimo', type: 'int', value: () => s.bajoMinimo },
              { header: 'Sobre el máximo', type: 'int', value: () => s.sobreMaximo },
              { header: 'Total', type: 'int', value: () => s.total },
            ],
            rows: [s],
          },
          {
            title: 'Detalle',
            note: truncatedNote(truncated),
            columns: [
              { header: 'Código', width: 12, value: (r) => r.product.code },
              { header: 'Producto', width: 34, value: (r) => r.product.name },
              { header: 'Categoría', width: 20, value: (r) => r.category.name },
              byWarehouse
                ? { header: 'Almacén', width: 22, value: (r) => ref(r.warehouse) }
                : { header: 'Desglose', width: 30, value: (r) => (r.warehouses ?? []).map((w) => `${w.code}: ${Number(w.quantity).toLocaleString('es')}`).join(' · ') },
              { header: warehouse || byWarehouse ? 'Existencia' : 'Existencia total', type: 'quantity', value: (r) => r.quantity },
              { header: 'Und.', width: 8, value: (r) => r.product.unitCode },
              ...(warehouse || byWarehouse ? [{ header: 'Total', type: 'quantity', value: (r) => r.total }] : []),
              { header: 'Mínimo', type: 'quantity', value: (r) => r.minStock },
              { header: 'Máximo', type: 'quantity', value: (r) => r.maxStock },
              { header: 'Estado', width: 16, value: (r) => STATUS_LABELS[r.status] },
            ],
            rows: items,
          },
        ],
      },
    ],
  });
};

/** Kardex de un producto (HU-409): el resumen del período y cada movimiento con su saldo acumulado. */
export const exportKardex = async (query, { actor } = {}) => {
  const { items, first, truncated } = await collectAllPages(getKardex, query);
  const s = first.summary;
  const allWarehouses = !s.warehouse;
  return toFile(`kardex-${s.product.code}`, {
    title: `Kardex · ${s.product.code} · ${s.product.name}`,
    generatedBy: actor?.username,
    filters: [
      { label: 'Producto', value: ref(s.product) },
      { label: 'Almacén', value: s.warehouse ? ref(s.warehouse) : 'Todos' },
      { label: 'Período', value: periodLabel(query) },
      { label: 'Unidad', value: s.product.unitCode },
    ],
    sheets: [
      {
        name: 'Kardex',
        blocks: [
          {
            title: 'Resumen del período',
            columns: [
              { header: 'Saldo inicial', type: 'quantity', value: () => s.opening },
              { header: 'Entradas', type: 'quantity', value: () => s.in },
              { header: 'Salidas', type: 'quantity', value: () => s.out },
              { header: 'Saldo final', type: 'quantity', value: () => s.closing },
            ],
            rows: [s],
          },
          {
            title: 'Movimientos',
            note: truncatedNote(truncated),
            columns: [
              { header: 'Fecha', type: 'datetime', width: 17, value: (r) => r.movement.movementDate },
              { header: 'Documento', width: 12, value: (r) => r.movement.documentNumber },
              { header: 'Referencia', width: 20, value: (r) => r.movement.reference },
              { header: 'Tipo', width: 16, value: (r) => TYPE_LABELS[r.movement.movementType] },
              { header: 'Motivo', width: 12, value: (r) => REASON_LABELS[r.movement.reason] },
              ...(allWarehouses ? [{ header: 'Almacén', width: 20, value: (r) => ref(r.warehouse) }] : []),
              { header: 'Activo', width: 26, value: (r) => ref(r.asset) },
              { header: 'Entrada', type: 'quantity', value: (r) => r.in },
              { header: 'Salida', type: 'quantity', value: (r) => r.out },
              { header: 'Saldo', type: 'quantity', value: (r) => r.balance },
            ],
            rows: items,
          },
        ],
      },
    ],
  });
};

/** Historial de movimientos (HU-408): una fila por documento, del más reciente al más antiguo. */
export const exportHistory = async (query, { actor } = {}) => {
  const { items, truncated } = await collectAllPages(listMovements, query);
  const [warehouse, product, asset] = await Promise.all([
    query.warehouseId && getWarehouse(query.warehouseId),
    query.productId && getProduct(query.productId),
    query.assetId && getAsset(query.assetId),
  ]);
  const user = query.userId === actor?.id ? actor.username : items[0]?.createdBy.fullName ?? `#${query.userId}`;
  return toFile('movimientos', {
    title: 'Historial de movimientos',
    generatedBy: actor?.username,
    filters: [
      { label: 'Período', value: periodLabel(query) },
      { label: 'Tipo', value: query.movementType ? TYPE_LABELS[query.movementType] : 'Todos' },
      { label: 'Motivo', value: query.reason ? REASON_LABELS[query.reason] : 'Todos' },
      { label: 'Almacén', value: warehouse ? ref(warehouse) : 'Todos' },
      ...(product ? [{ label: 'Producto', value: ref(product) }] : []),
      ...(asset ? [{ label: 'Activo', value: ref(asset) }] : []),
      ...(query.userId ? [{ label: 'Registrado por', value: user }] : []),
      ...(query.search ? [{ label: 'Búsqueda', value: query.search }] : []),
    ],
    sheets: [
      {
        name: 'Movimientos',
        blocks: [
          {
            title: `${items.length} documentos`,
            note: truncatedNote(truncated),
            columns: [
              { header: 'Fecha', type: 'datetime', width: 17, value: (r) => r.movementDate },
              { header: 'Documento', width: 12, value: (r) => r.documentNumber },
              { header: 'Tipo', width: 16, value: (r) => TYPE_LABELS[r.movementType] },
              { header: 'Motivo', width: 12, value: (r) => REASON_LABELS[r.reason] },
              { header: 'Referencia', width: 20, value: (r) => r.reference },
              { header: 'Orden de trabajo', width: 16, value: (r) => r.workOrder },
              { header: 'Origen', width: 20, value: (r) => ref(r.fromWarehouse) },
              { header: 'Destino', width: 20, value: (r) => ref(r.toWarehouse) },
              { header: 'Líneas', type: 'int', width: 8, value: (r) => r.lineCount },
              { header: 'Retirado / recibido por', width: 22, value: (r) => r.receivedBy },
              { header: 'Registrado por', width: 22, value: (r) => r.createdBy.fullName },
              { header: 'Correcciones', type: 'int', width: 12, value: (r) => (r.isCorrection ? null : r.correctionCount) },
              { header: 'Es corrección', width: 12, value: (r) => (r.isCorrection ? 'Sí' : '') },
              { header: 'Observación', width: 40, value: (r) => r.note },
            ],
            rows: items,
          },
        ],
      },
    ],
  });
};

/** Consumo por activo o por categoría de activo (HU-501): los totales por producto y el detalle. */
export const exportConsumption = async (query, { actor } = {}) => {
  const { items, first, truncated } = await collectAllPages(getConsumptionReport, query);
  const byCategory = query.groupBy === 'assetCategory';
  const s = first.summary;
  const [product, asset, productCategory] = await Promise.all([
    query.productId && getProduct(query.productId),
    !byCategory && query.assetId && getAsset(query.assetId),
    query.productCategoryId && getProductCategory(query.productCategoryId),
  ]);
  const assetCategory = query.assetCategoryId ? await getAssetCategory(query.assetCategoryId) : null;
  return toFile(byCategory ? 'consumo-por-categoria' : 'consumo-por-activo', {
    title: byCategory ? 'Consumo por categoría de activo' : 'Consumo por activo',
    generatedBy: actor?.username,
    filters: [
      { label: 'Período', value: periodLabel(query) },
      { label: 'Categoría de activo', value: assetCategory ? assetCategory.name : 'Todas' },
      ...(!byCategory ? [{ label: 'Activo', value: asset ? ref(asset) : 'Todos' }] : []),
      { label: 'Categoría de producto', value: productCategory ? productCategory.name : 'Todas' },
      { label: 'Producto', value: product ? ref(product) : 'Todos' },
      { label: 'Cálculo', value: 'Consumo neto = consumido − corregido (REV-)' },
    ],
    sheets: [
      {
        name: 'Consumo',
        blocks: [
          {
            title: 'Totales por producto',
            columns: [
              { header: 'Código', width: 12, value: (p) => p.product.code },
              { header: 'Producto', width: 34, value: (p) => p.product.name },
              { header: 'Activos', type: 'int', value: (p) => p.assets },
              { header: 'Consumido', type: 'quantity', value: (p) => p.consumed },
              { header: 'Corregido', type: 'quantity', value: (p) => p.corrected },
              { header: 'Neto', type: 'quantity', value: (p) => p.net },
              { header: 'Und.', width: 8, value: (p) => p.product.unitCode },
            ],
            rows: s.products,
            empty: 'Sin consumos con estos filtros.',
          },
          {
            title: `Detalle ${byCategory ? 'por categoría' : 'por activo'} · ${s.groups} ${byCategory ? 'categorías' : 'activos'} · ${s.lines} líneas`,
            note: truncatedNote(truncated),
            columns: [
              ...(byCategory
                ? [{ header: 'Categoría', width: 26, value: (r) => r.assetCategory.name }]
                : [
                    { header: 'Activo', width: 12, value: (r) => r.asset.code },
                    { header: 'Nombre', width: 30, value: (r) => r.asset.name },
                    { header: 'Categoría', width: 20, value: (r) => r.asset.category.name },
                  ]),
              { header: 'Código', width: 12, value: (r) => r.product.code },
              { header: 'Producto', width: 30, value: (r) => r.product.name },
              ...(byCategory ? [{ header: 'Activos', type: 'int', value: (r) => r.assets }] : []),
              { header: 'Consumido', type: 'quantity', value: (r) => r.consumed },
              { header: 'Corregido', type: 'quantity', value: (r) => r.corrected },
              { header: 'Neto', type: 'quantity', value: (r) => r.net },
              { header: 'Und.', width: 8, value: (r) => r.product.unitCode },
              ...(!byCategory ? [{ header: 'Último consumo', type: 'datetime', width: 17, value: (r) => r.lastConsumedAt }] : []),
            ],
            rows: items,
            empty: 'Sin consumos con estos filtros.',
          },
        ],
      },
    ],
  });
};

/** Movimientos por período (HU-502): documentos por tipo, por motivo y por período, y el detalle por producto. */
export const exportMovementsReport = async (query, { actor } = {}) => {
  const { items, first, truncated } = await collectAllPages(getMovementsReport, query);
  const s = first.summary;
  const [product, productCategory] = await Promise.all([query.productId && getProduct(query.productId), query.productCategoryId && getProductCategory(query.productCategoryId)]);
  return toFile('movimientos-por-periodo', {
    title: 'Movimientos por período',
    generatedBy: actor?.username,
    filters: [
      { label: 'Período', value: periodLabel(query) },
      { label: 'Tipo', value: query.movementType ? TYPE_LABELS[query.movementType] : 'Todos' },
      { label: 'Motivo', value: query.reason ? REASON_LABELS[query.reason] : 'Todos' },
      { label: 'Almacén', value: s.warehouse ? ref(s.warehouse) : 'Todos (un traslado entra y sale)' },
      { label: 'Categoría de producto', value: productCategory ? productCategory.name : 'Todas' },
      { label: 'Producto', value: product ? ref(product) : 'Todos' },
    ],
    sheets: [
      {
        name: 'Resumen',
        blocks: [
          {
            title: 'Documentos por tipo',
            columns: [
              ...TYPE_ORDER.map((type) => ({ header: TYPE_PLURALS[type], type: 'int', width: 16, value: () => s.byType[type] })),
              { header: 'Documentos', type: 'int', value: () => s.documents },
              { header: 'Líneas', type: 'int', value: () => s.lines },
              { header: 'Productos', type: 'int', value: () => s.products },
            ],
            rows: [s],
          },
          {
            title: 'Por tipo y motivo',
            columns: [
              { header: 'Tipo', width: 24, value: (r) => TYPE_LABELS[r.movementType] },
              { header: 'Motivo', value: (r) => REASON_LABELS[r.reason] },
              { header: 'Documentos', type: 'int', value: (r) => r.documents },
              { header: 'Líneas', type: 'int', value: (r) => r.lines },
              { header: 'Correcciones', type: 'int', value: (r) => r.corrections },
            ],
            rows: s.byReason,
            empty: 'Sin movimientos con estos filtros.',
          },
          {
            title: `Por ${INTERVAL_LABELS[s.interval].toLowerCase()}`,
            columns: [
              { header: `${INTERVAL_LABELS[s.interval]} (inicio)`, type: 'date', value: (p) => `${p.period}T00:00:00` },
              ...TYPE_ORDER.map((type) => ({ header: TYPE_PLURALS[type], type: 'int', value: (p) => p[type] })),
              { header: 'Documentos', type: 'int', value: (p) => p.documents },
            ],
            rows: s.byPeriod,
            empty: 'Sin movimientos con estos filtros.',
          },
        ],
      },
      {
        name: 'Por producto',
        blocks: [
          {
            title: s.warehouse ? `Por producto · solo ${s.warehouse.name}` : 'Por producto · todos los almacenes',
            note: truncatedNote(truncated),
            columns: [
              { header: 'Código', width: 12, value: (r) => r.product.code },
              { header: 'Producto', width: 34, value: (r) => r.product.name },
              { header: 'Entradas', type: 'quantity', value: (r) => r.entries },
              { header: 'Salidas', type: 'quantity', value: (r) => r.exits },
              { header: 'Traslado entra', type: 'quantity', value: (r) => r.transfersIn },
              { header: 'Traslado sale', type: 'quantity', value: (r) => r.transfersOut },
              { header: 'Sobrante', type: 'quantity', value: (r) => r.adjustmentsIn },
              { header: 'Faltante', type: 'quantity', value: (r) => r.adjustmentsOut },
              { header: 'Neto', type: 'quantity', value: (r) => r.net },
              { header: 'Und.', width: 8, value: (r) => r.product.unitCode },
              { header: 'Documentos', type: 'int', value: (r) => r.documents },
            ],
            rows: items,
            empty: 'Sin movimientos con estos filtros.',
          },
        ],
      },
    ],
  });
};
