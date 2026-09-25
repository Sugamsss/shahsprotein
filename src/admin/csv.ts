// CSV for Excel and Google Sheets. A BOM so Marathi and Hindi names open right
// in Excel, CRLF line ends, every field quoted, and a guard against formula
// injection: a cell starting with = + - @ tab or CR would run as a formula, so it
// gets a leading ' (a name like "=HYPERLINK(...)" typed into the order popup).

export type CsvValue = string | number | boolean | null | undefined;

const BOM = '﻿';
const RISKY_START = /^[=+\-@\t\r]/;

const cell = (value: CsvValue): string => {
  if (value === null || value === undefined) return '""';
  // Numbers are ours (amounts, counts), so they're never guarded.
  const text = typeof value === 'string' && RISKY_START.test(value) ? `'${value}` : String(value);
  return `"${text.replace(/"/g, '""')}"`;
};

export const toCsv = (headers: string[], rows: CsvValue[][]): string =>
  BOM + [headers, ...rows].map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';

export const downloadCsv = (filename: string, csv: string): void => {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Some browsers start the download a tick later.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
