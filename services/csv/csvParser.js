/**
 * Lector CSV tolerante: BOM, CRLF, comillas dobles escapadas, saltos de línea
 * dentro de comillas y separadores ',', ';', tabulador o '|'.
 */

export const DELIMITERS = [',', ';', '\t', '|'];

export function parseCSV(text, delimiter) {
  const src = String(text ?? '').replace(/^﻿/, '');
  const d = delimiter || detectDelimiter(src);
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"' && field.trim() === '') {
      field = '';
      inQuotes = true;
    } else if (ch === d) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (inQuotes) {
    throw new Error('El archivo tiene comillas sin cerrar');
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.map(r => r.map(c => c.trim())).filter(r => r.some(c => c !== ''));
}

export function detectDelimiter(text) {
  const lines = String(text ?? '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter(l => l.trim())
    .slice(0, 25);
  let best = ',';
  let bestScore = -1;
  for (const d of DELIMITERS) {
    let counts;
    try {
      counts = lines.map(l => (parseCSV(l, d)[0] || []).length);
    } catch (_) {
      continue;
    }
    // Moda del número de columnas entre las líneas con más de una columna:
    // tolera líneas de prefacio del banco ("Estado de cuenta", "Periodo…").
    const freq = new Map();
    counts.filter(c => c > 1).forEach(c => freq.set(c, (freq.get(c) || 0) + 1));
    if (!freq.size) continue;
    const [cols, times] = [...freq.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
    const score = times * 1000 + cols;
    if (score > bestScore) {
      best = d;
      bestScore = score;
    }
  }
  return best;
}

const HEADER_HINTS = {
  date: ['fecha', 'date', 'fecha operacion', 'fecha de operacion', 'dia'],
  amount: ['importe', 'monto', 'amount', 'cantidad', 'valor', 'total'],
  debit: ['cargo', 'cargos', 'retiro', 'retiros', 'debito', 'egreso', 'salida'],
  credit: ['abono', 'abonos', 'deposito', 'ingreso', 'entrada', 'credito'],
  description: ['descripcion', 'concepto', 'detalle', 'description', 'comercio', 'movimiento'],
  type: ['tipo', 'type', 'naturaleza'],
  reference: ['referencia', 'folio', 'id', 'reference', 'autorizacion', 'numero'],
  category: ['categoria', 'category'],
};

export const normalizeText = s =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** La primera fila es encabezado si no contiene importes ni fechas. */
export function looksLikeHeader(row) {
  if (!row || !row.length) return false;
  const dataLike = row.filter(
    c => /^[-+(]?\s*\$?\s*[\d.,]+\)?$/.test(c) || /^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}/.test(c),
  ).length;
  return dataLike === 0;
}

/** Sugiere qué columna corresponde a cada campo a partir de los encabezados. */
export function suggestMapping(headers) {
  const mapping = {};
  const used = new Set();
  const order = ['date', 'debit', 'credit', 'amount', 'description', 'type', 'reference', 'category'];
  const normalized = headers.map(normalizeText);
  for (const field of order) {
    const hints = HEADER_HINTS[field];
    let idx = normalized.findIndex((h, i) => !used.has(i) && hints.includes(h));
    if (idx < 0) idx = normalized.findIndex((h, i) => !used.has(i) && hints.some(x => h.split(/[^a-z]+/).includes(x)));
    if (idx >= 0) {
      mapping[field] = idx;
      used.add(idx);
    }
  }
  if (mapping.debit !== undefined && mapping.credit !== undefined) delete mapping.amount;
  else {
    // Sin par cargo/abono, una sola columna de cargo o abono actúa como importe.
    if (mapping.amount === undefined && mapping.debit !== undefined) {
      mapping.amount = mapping.debit;
      mapping.amountSign = 'positiveIsExpense';
    }
    delete mapping.debit;
    delete mapping.credit;
  }
  return mapping;
}

/**
 * Índice de la fila de encabezados: la primera (entre las 15 primeras) cuyo
 * mapeo sugerido incluye fecha e importe (o cargo/abono). -1 si no hay.
 */
export function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    if (!looksLikeHeader(rows[i]) || rows[i].length < 2) continue;
    const m = suggestMapping(rows[i]);
    if (m.date !== undefined && (m.amount !== undefined || (m.debit !== undefined && m.credit !== undefined))) return i;
  }
  return -1;
}
