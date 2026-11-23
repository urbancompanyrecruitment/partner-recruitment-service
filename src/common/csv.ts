const CSV_BOM = '\uFEFF';

const CSV_ROW_SEPARATOR = '\r\n';

const CSV_CELL_SEPARATOR = ',';

const DOUBLE_QUOTE = /"/g;

const NEEDS_QUOTES = /[",\r\n]/;

const quoteCell = (value: unknown): string => `"${String(value ?? '').replace(DOUBLE_QUOTE, '""')}"`;

export const toCsv = (rows: unknown[][]): string =>
  CSV_BOM + rows.map(row => row.map(quoteCell).join(CSV_CELL_SEPARATOR)).join(CSV_ROW_SEPARATOR);

export const toPlainCsv = (rows: unknown[][]): string =>
  rows
    .map(row =>
      row.map(value => (NEEDS_QUOTES.test(String(value ?? '')) ? quoteCell(value) : String(value ?? ''))).join(CSV_CELL_SEPARATOR),
    )
    .join(CSV_ROW_SEPARATOR);
