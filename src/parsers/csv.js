function splitCsvLine(line) {
  const out = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = line[i + 1];
    if (ch === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out;
}

function parseValue(value) {
  if (value == null) return undefined;
  const trimmed = String(value).trim();
  if (trimmed === '') return undefined;
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) && /^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(trimmed) ? numeric : trimmed;
}

export async function parseCsvFile(file) {
  const text = await file.text();
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim().length);
  if (!lines.length) return [];
  const headers = splitCsvLine(lines[0]).map((h) => String(h).trim());
  return lines.slice(1).map((line) => {
    const parts = splitCsvLine(line);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = parseValue(parts[index]);
    });
    return row;
  });
}
