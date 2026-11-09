const CSV_BOM = '﻿';

const CSV_ROW_SEPARATOR = '\r\n';

const CSV_CELL_SEPARATOR = ',';

const DOUBLE_QUOTE = /"/g;

export const toCsv = (rows: unknown[][]): string =>
  CSV_BOM +
  rows
    .map(row => row.map(value => `"${String(value ?? '').replace(DOUBLE_QUOTE, '""')}"`).join(CSV_CELL_SEPARATOR))
    .join(CSV_ROW_SEPARATOR);
