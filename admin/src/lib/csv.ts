/** ייצוא CSV שנפתח נכון באקסל (BOM לעברית) ומוגן מהזרקת נוסחאות. */
export function toCsv<T>(rows: T[], cols: { label: string; value: (r: T) => unknown }[]): string {
  const cell = (v: unknown) => {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.map((c) => cell(c.label)).join(',')];
  for (const r of rows) lines.push(cols.map((c) => cell(c.value(r))).join(','));
  return '﻿' + lines.join('\r\n');
}

export function downloadCsv(name: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
