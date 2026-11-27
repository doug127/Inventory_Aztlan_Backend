// Tipos y motivos de movimiento (db_schema.md: movement_type_enum y movement_reason_enum).
export const MOVEMENT_TYPES = { IN: 'IN', OUT: 'OUT', TRANSFER: 'TRANSFER', ADJUST: 'ADJUST' };

export const MOVEMENT_REASONS = {
  COMPRA: 'COMPRA',
  DEVOLUCION: 'DEVOLUCION',
  CONSUMO: 'CONSUMO',
  PRESTAMO: 'PRESTAMO',
  DESECHO: 'DESECHO',
  VENTA: 'VENTA',
  TRASLADO: 'TRASLADO',
  AJUSTE: 'AJUSTE',
  OTRO: 'OTRO',
};

/** Referencia de las correcciones (business_rules.md §5): REV-RET-000145. */
export const CORRECTION_REFERENCE_PREFIX = 'REV-';

/**
 * Qué representa una línea de movimiento para el activo que la recibe (HU-304, ficha del activo):
 *  - CONSUMO:    OUT CONSUMO, suma al consumo.
 *  - CORRECCION: IN OTRO con referencia REV-, resta del consumo (consumo neto, business_rules.md §5).
 *  - PRESTAMO / DEVOLUCION: OUT PRESTAMO e IN DEVOLUCION, no cuentan como consumo.
 *  - OTRO:       el resto (DESECHO, VENTA, OTRO sin REV-), tampoco cuenta.
 */
export const ASSET_LINE_KINDS = {
  CONSUMO: 'CONSUMO',
  CORRECCION: 'CORRECCION',
  PRESTAMO: 'PRESTAMO',
  DEVOLUCION: 'DEVOLUCION',
  OTRO: 'OTRO',
};

/** Motivos permitidos por tipo (chk_movement_reason, business_rules.md §2.1). */
export const REASONS_BY_TYPE = {
  IN: ['COMPRA', 'DEVOLUCION', 'OTRO'],
  OUT: ['CONSUMO', 'PRESTAMO', 'DESECHO', 'VENTA', 'OTRO'],
  TRANSFER: ['TRASLADO'],
  ADJUST: ['AJUSTE'],
};

/** Motivos de OUT que exigen un activo en cada línea (§2.3 reglas 3 y 4; trg_movement_lines_asset_rule). */
export const OUT_REASONS_REQUIRING_ASSET = ['CONSUMO', 'PRESTAMO'];

/** Motivos de OUT que exigen observación: DESECHO (§2.3 regla 5) y OTRO (user_flow.md §5, paso 1). */
export const OUT_REASONS_REQUIRING_NOTE = ['DESECHO', 'OTRO'];

/** Motivos de la entrada que se registran hoy: COMPRA y OTRO. DEVOLUCION llega con los préstamos (HU-405). */
export const ENTRY_REASONS = ['COMPRA', 'OTRO'];

/** Días de atraso que puede registrar un ALMACENISTA (§4 regla 2). */
export const BACKDATE_DAYS_ALMACENISTA = 3;

/**
 * Documentos de recepción de una entrada (tabla movement_documents, chk_movement_documents_type) y el
 * prefijo con el que forman la referencia de la entrada (naming_conventions.md §8.2): FAC-0012345.
 */
export const RECEIPT_DOCUMENT_TYPES = {
  FACTURA: 'FACTURA',
  VALE: 'VALE',
  RECIBO: 'RECIBO',
  NOTA_ENTREGA: 'NOTA_ENTREGA',
  GUIA_DESPACHO: 'GUIA_DESPACHO',
  ORDEN_COMPRA: 'ORDEN_COMPRA',
};

export const RECEIPT_DOCUMENT_PREFIXES = {
  FACTURA: 'FAC',
  VALE: 'VAL',
  RECIBO: 'REC',
  NOTA_ENTREGA: 'NE',
  GUIA_DESPACHO: 'GD',
  ORDEN_COMPRA: 'OC',
};

/** Documentos por entrada. */
export const MAX_RECEIPT_DOCUMENTS = 10;

/** Archivo adjunto de un documento: PDF o foto, hasta 10 MB (chk_movement_documents_file_*). */
export const RECEIPT_FILE_MIME_TYPES = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};
export const RECEIPT_FILE_MAX_BYTES = 10 * 1024 * 1024;
