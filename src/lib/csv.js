// Minimal RFC4180-ish CSV parser — handles quoted fields, embedded commas,
// escaped quotes ("") and both \n and \r\n line endings. No dependency
// needed for the scale this app deals with (personal bank/expense exports).
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => { rows.push(row); row = []; };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      pushField();
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      pushField();
      pushRow();
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { pushField(); pushRow(); }

  const nonEmpty = rows.filter((r) => r.some((cell) => cell !== ''));
  const [headerRow, ...dataRows] = nonEmpty;
  if (!headerRow) return [];
  const headers = headerRow.map((h) => h.trim().toLowerCase());
  return dataRows.map((r) => {
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = (r[idx] ?? '').trim(); });
    return obj;
  });
}
