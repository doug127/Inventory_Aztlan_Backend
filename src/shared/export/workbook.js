// Libros de Excel de los reportes (HU-503). Sin HTTP: recibe filas ya convertidas a DTO y devuelve el
// archivo .xlsx en un Buffer. Cada hoja lleva el encabezado de la empresa, el título, los filtros
// aplicados y quién la generó, y luego uno o más bloques (tabla con su título).
import ExcelJS from 'exceljs';

export const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const COMPANY = 'Agrícola Aztlan, C.A.';

/** Formatos de celda por tipo de columna. Las cantidades van con 3 decimales y el negativo en rojo. */
const NUMBER_FORMATS = {
  quantity: '#,##0.000;[Red]-#,##0.000',
  int: '0',
  datetime: 'dd/mm/yyyy hh:mm',
  date: 'dd/mm/yyyy',
};

/**
 * Excel no tiene zona horaria: guarda la hora tal cual. exceljs escribe la hora UTC de un Date, así que
 * se corre a la hora del servidor (la de la finca) para que la celda muestre la misma hora que la pantalla.
 */
const toWallClock = (date) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000);

/** Valor de una celda según su tipo: las cantidades (texto NUMERIC de los DTO) pasan a número. */
const cellValue = (value, type) => {
  if (value === null || value === undefined || value === '') return null;
  if (type === 'quantity') return Number(value);
  if (type === 'datetime' || type === 'date') return toWallClock(value instanceof Date ? value : new Date(value));
  return value;
};

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EFE6' } };
const BORDER = { bottom: { style: 'thin', color: { argb: 'FFD5DED2' } } };

const generatedLabel = (generatedAt) =>
  generatedAt.toLocaleString('es', { dateStyle: 'long', timeStyle: 'short' });

/**
 * Arma el libro. sheets: [{ name, blocks: [{ title?, columns: [{ header, type?, width?, value: (row) => any }], rows, note? }] }].
 * title y filters ([{ label, value }]) se repiten arriba de cada hoja. Devuelve un Buffer .xlsx.
 */
export const buildWorkbook = async ({ title, filters = [], generatedBy, generatedAt = new Date(), sheets }) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = COMPANY;
  workbook.created = generatedAt;

  for (const sheet of sheets) {
    const ws = workbook.addWorksheet(sheet.name.slice(0, 31), { views: [{ showGridLines: false }] });
    const width = Math.max(...sheet.blocks.map((b) => b.columns.length), 2);

    ws.addRow([COMPANY]).font = { bold: true, color: { argb: 'FF58695E' } };
    const titleRow = ws.addRow([title]);
    titleRow.font = { bold: true, size: 14 };
    for (const { label, value } of filters) {
      const row = ws.addRow([label, value]);
      row.getCell(1).font = { color: { argb: 'FF58695E' } };
    }
    ws.addRow([`Generado el ${generatedLabel(generatedAt)}${generatedBy ? ` por ${generatedBy}` : ''}`]).font = { italic: true, size: 9, color: { argb: 'FF58695E' } };

    for (const block of sheet.blocks) {
      ws.addRow([]);
      if (block.title) ws.addRow([block.title]).font = { bold: true, size: 11 };
      if (block.note) ws.addRow([block.note]).font = { bold: true, color: { argb: 'FF8A6836' } };
      const header = ws.addRow(block.columns.map((c) => c.header));
      header.eachCell((cell) => {
        cell.font = { bold: true };
        cell.fill = HEADER_FILL;
        cell.border = BORDER;
      });
      block.columns.forEach((c, i) => {
        if (c.type === 'quantity' || c.type === 'int') header.getCell(i + 1).alignment = { horizontal: 'right' };
      });
      for (const item of block.rows) {
        const row = ws.addRow(block.columns.map((c) => cellValue(c.value(item), c.type)));
        block.columns.forEach((c, i) => {
          if (NUMBER_FORMATS[c.type]) row.getCell(i + 1).numFmt = NUMBER_FORMATS[c.type];
        });
      }
      if (block.rows.length === 0) ws.addRow([block.empty ?? 'Sin datos con estos filtros.']).font = { italic: true, color: { argb: 'FF58695E' } };
    }

    // Ancho de columna: el mayor pedido por algún bloque, o uno razonable.
    for (let i = 0; i < width; i += 1) {
      const requested = Math.max(...sheet.blocks.map((b) => b.columns[i]?.width ?? 0));
      ws.getColumn(i + 1).width = requested || (i === 0 ? 24 : 14);
    }
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
};

/** Máximo de filas que se exportan; igual que la hoja imprimible. */
export const EXPORT_MAX_ROWS = 10_000;
const EXPORT_PAGE_SIZE = 100;

/**
 * Recorre un listado paginado (un service que devuelve el formato de sendPaginated) y junta todas sus
 * filas, hasta EXPORT_MAX_ROWS. Devuelve { items, first (la primera respuesta, con summary y filters), truncated }.
 */
export const collectAllPages = async (list, query) => {
  const first = await list({ ...query, page: 1, limit: EXPORT_PAGE_SIZE });
  const items = [...first.items];
  const pages = Math.min(Math.ceil(first.total / EXPORT_PAGE_SIZE), EXPORT_MAX_ROWS / EXPORT_PAGE_SIZE);
  for (let page = 2; page <= pages; page += 1) {
    items.push(...(await list({ ...query, page, limit: EXPORT_PAGE_SIZE })).items);
  }
  return { items, first, truncated: first.total > items.length };
};

/** Nombre del archivo: existencias-2026-11-28.xlsx. */
export const exportFileName = (slug, date = new Date()) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${slug}-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.xlsx`;
};
