// Client-side file downloads (CSV export, backup JSON) — no server involved,
// just a Blob and a throwaway <a download>.
function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// RFC 4180: quote any field containing a comma, quote, or newline; escape
// embedded quotes by doubling them.
function csvCell(value) {
  const s = value == null ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// rows: array of objects. columns: [{ key, label }] — controls both column
// order and header text, so callers don't need to pre-shape their data.
export function downloadCsv(filename, columns, rows) {
  const lines = [
    columns.map((c) => csvCell(c.label)).join(','),
    ...rows.map((row) => columns.map((c) => csvCell(row[c.key])).join(',')),
  ];
  // ﻿: BOM so Excel (incl. on macOS) detects UTF-8 instead of guessing
  // a legacy codepage and mangling non-ASCII text (e.g. Greek descriptions).
  triggerDownload(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), filename);
}

export function downloadJson(filename, data) {
  triggerDownload(new Blob([data], { type: 'application/json' }), filename);
}
