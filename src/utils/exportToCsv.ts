export function exportToCsv(filename: string, headers: string[], rows: string[][]): void {
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const csv = [headers, ...rows].map((row) => row.map((value) => escape(value)).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
