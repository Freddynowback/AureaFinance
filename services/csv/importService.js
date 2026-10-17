/**
 * Importación CSV en tres pasos:
 *   1. prepareImport: lee el texto, detecta separador/encabezados y sugiere mapeo.
 *   2. buildPreview: convierte filas en movimientos propuestos, con errores por
 *      fila, categoría sugerida y posibles duplicados (no descarta nada solo).
 *   3. commitImport: inserta las filas elegidas en UNA transacción; si una
 *      falla, no se guarda ninguna y los datos existentes quedan intactos.
 */
import { accountsRepository } from '../../database/repositories/accountsRepository';
import { transactionsRepository } from '../../database/repositories/transactionsRepository';
import { addDays, parseFlexibleDate, stamp } from '../../utils/dates';
import { ValidationError } from '../../utils/errors';
import { uuid } from '../../utils/id';
import { parseAmount } from '../../utils/money';
import { insertTransaction } from '../transactions/transactionService';
import { findHeaderRow, looksLikeHeader, normalizeText, parseCSV, suggestMapping, detectDelimiter } from './csvParser';

export const MAX_IMPORT_ROWS = 5000;

export function prepareImport(text, { delimiter } = {}) {
  if (!text || !String(text).trim()) throw new ValidationError({ file: 'El archivo está vacío' });
  const d = delimiter || detectDelimiter(text);
  let rows;
  try {
    rows = parseCSV(text, d);
  } catch (e) {
    throw new ValidationError({ file: e.message });
  }
  if (!rows.length) throw new ValidationError({ file: 'El archivo no contiene filas' });
  const width = Math.max(...rows.map(r => r.length));
  if (width < 2) throw new ValidationError({ file: 'No se detectaron columnas: revisa el separador' });
  // Algunos bancos añaden líneas de prefacio antes de la tabla: se omiten.
  const headerRow = findHeaderRow(rows);
  const skipped = headerRow > 0 ? headerRow : 0;
  const body = rows.slice(skipped);
  const hasHeader = headerRow >= 0 || looksLikeHeader(body[0]);
  const headers = hasHeader ? body[0] : body[0].map((_, i) => `Columna ${i + 1}`);
  const dataRows = (hasHeader ? body.slice(1) : body).filter(r => r.length > 1);
  if (dataRows.length > MAX_IMPORT_ROWS) {
    throw new ValidationError({ file: `Máximo ${MAX_IMPORT_ROWS} filas por importación` });
  }
  return { delimiter: d, hasHeader, headers, rows: dataRows, skippedLines: skipped, mapping: hasHeader ? suggestMapping(headers) : {} };
}

const EXPENSE_WORDS = ['cargo', 'gasto', 'compra', 'retiro', 'debito', 'egreso', 'pago'];
const INCOME_WORDS = ['abono', 'ingreso', 'deposito', 'nomina', 'credito', 'entrada'];
const REFUND_WORDS = ['devolucion', 'reembolso', 'reverso', 'bonificacion'];

/**
 * Convierte una fila en un movimiento propuesto.
 * options.amountSign: 'negativeIsExpense' (por defecto) | 'positiveIsExpense'
 * options.dateOrder: 'dmy' (México) | 'mdy'
 */
export function rowToCandidate(row, rowIndex, mapping, options = {}) {
  const errors = [];
  const cell = k => (mapping[k] === undefined ? '' : row[mapping[k]] ?? '');
  const occurredAt = parseFlexibleDate(cell('date'), options.dateOrder || 'dmy');
  if (mapping.date === undefined) errors.push('Falta la columna de fecha');
  else if (!occurredAt) errors.push(`Fecha no reconocida: "${cell('date')}"`);

  let amount = null;
  let kind = null;
  if (mapping.debit !== undefined || mapping.credit !== undefined) {
    const debit = cell('debit') ? parseAmount(cell('debit')) : null;
    const credit = cell('credit') ? parseAmount(cell('credit')) : null;
    if (cell('debit') && debit === null) errors.push(`Cargo no válido: "${cell('debit')}"`);
    if (cell('credit') && credit === null) errors.push(`Abono no válido: "${cell('credit')}"`);
    if (debit && credit) errors.push('La fila tiene cargo y abono a la vez');
    else if (debit) {
      amount = Math.abs(debit);
      kind = 'expense';
    } else if (credit) {
      amount = Math.abs(credit);
      kind = 'income';
    } else if (!errors.length) errors.push('La fila no tiene importe');
  } else if (mapping.amount !== undefined) {
    const raw = parseAmount(cell('amount'));
    if (raw === null) errors.push(`Importe no válido: "${cell('amount')}"`);
    else if (raw === 0) errors.push('Importe igual a cero');
    else {
      const sign = mapping.amountSign || options.amountSign || 'negativeIsExpense';
      const isExpense = sign === 'negativeIsExpense' ? raw < 0 : raw > 0;
      amount = Math.abs(raw);
      kind = isExpense ? 'expense' : 'income';
    }
  } else {
    errors.push('Falta la columna de importe');
  }

  // Una columna "tipo" explícita tiene prioridad.
  const typeText = normalizeText(cell('type'));
  if (typeText) {
    if (REFUND_WORDS.some(w => typeText.includes(w))) kind = 'refund';
    else if (EXPENSE_WORDS.some(w => typeText.includes(w))) kind = 'expense';
    else if (INCOME_WORDS.some(w => typeText.includes(w))) kind = 'income';
  }
  const description = cell('description') || null;
  if (kind === 'income' && REFUND_WORDS.some(w => normalizeText(description).includes(w))) kind = 'refund';

  return {
    rowIndex,
    raw: row,
    kind,
    amount,
    occurred_at: occurredAt,
    description,
    external_id: cell('reference') || null,
    categoryHint: cell('category') || null,
    errors,
    valid: errors.length === 0,
  };
}

/** Categoría más usada para descripciones iguales en el historial. */
async function categoryFromHistory(db, description, kind) {
  if (!description) return null;
  const row = await db.get(
    `SELECT category_id, COUNT(*) AS n FROM transactions
     WHERE kind = ? AND category_id IS NOT NULL AND lower(trim(description)) = lower(trim(?))
     GROUP BY category_id ORDER BY n DESC LIMIT 1`,
    [kind === 'refund' ? 'expense' : kind, description],
  );
  return row ? row.category_id : null;
}

/**
 * Posibles duplicados: mismo identificador de origen (fuerte) o misma cuenta,
 * tipo e importe con fecha ±1 día (posible). También repeticiones dentro del
 * propio archivo. Nunca se descartan automáticamente.
 */
export async function findDuplicates(db, accountId, candidate, seen) {
  const matches = [];
  if (candidate.external_id) {
    const byRef = await transactionsRepository.findByExternalId(db, accountId, candidate.external_id);
    if (byRef) matches.push({ id: byRef.id, strength: 'strong', reason: 'Misma referencia ya importada' });
  }
  const day = candidate.occurred_at.slice(0, 10);
  const similar = await transactionsRepository.findSimilar(db, {
    accountId,
    amount: candidate.amount,
    kind: candidate.kind,
    from: addDays(day, -1),
    to: addDays(day, 2),
  });
  for (const s of similar) {
    if (!matches.some(m => m.id === s.id)) {
      const sameText = normalizeText(s.description) === normalizeText(candidate.description);
      matches.push({
        id: s.id,
        strength: sameText ? 'likely' : 'possible',
        reason: sameText ? 'Mismo importe, fecha y descripción' : 'Mismo importe y fecha cercana',
        description: s.description,
        occurred_at: s.occurred_at,
      });
    }
  }
  const key = `${candidate.kind}|${candidate.amount}|${day}|${normalizeText(candidate.description)}`;
  if (seen.has(key)) {
    matches.push({ id: null, strength: 'possible', reason: `Igual a la fila ${seen.get(key) + 1} del archivo` });
  } else {
    seen.set(key, candidate.rowIndex);
  }
  return matches;
}

export async function buildPreview(db, prepared, { accountId, mapping, dateOrder, amountSign, defaultCategories = {} }) {
  const account = await accountsRepository.get(db, accountId);
  if (!account) throw new ValidationError({ accountId: 'Elige la cuenta de los movimientos' });
  const map = mapping || prepared.mapping;
  const seen = new Map();
  const activeCats = await db.all("SELECT id, lower(name) AS lname FROM categories WHERE status = 'active'");
  const catByName = new Map(activeCats.map(c => [c.lname, c.id]));
  const historyCache = new Map();
  const items = [];
  for (let i = 0; i < prepared.rows.length; i++) {
    const c = rowToCandidate(prepared.rows[i], i, map, { dateOrder, amountSign });
    if (c.valid && c.kind === 'income' && account.type === 'credit') {
      // En una tarjeta, un abono es un pago o una devolución, no un ingreso.
      c.kind = 'refund';
    }
    if (c.valid) {
      let categoryId = null;
      if (c.categoryHint) categoryId = catByName.get(c.categoryHint.trim().toLowerCase()) || null;
      if (!categoryId) {
        const key = `${c.kind}|${normalizeText(c.description)}`;
        if (!historyCache.has(key)) historyCache.set(key, await categoryFromHistory(db, c.description, c.kind));
        categoryId = historyCache.get(key);
      }
      if (!categoryId) categoryId = c.kind === 'income' ? defaultCategories.income || null : defaultCategories.expense || null;
      c.category_id = categoryId;
      c.duplicates = await findDuplicates(db, accountId, c, seen);
      c.selected = !c.duplicates.some(d => d.strength !== 'possible');
    } else {
      c.duplicates = [];
      c.selected = false;
    }
    items.push(c);
  }
  return {
    accountId,
    items,
    validCount: items.filter(i => i.valid).length,
    errorCount: items.filter(i => !i.valid).length,
    duplicateCount: items.filter(i => i.duplicates.length).length,
  };
}

/** Inserta los elementos elegidos en una sola transacción (todo o nada). */
export function commitImport(db, { accountId, items, fileName }) {
  const chosen = items.filter(i => i.valid && i.selected);
  if (!chosen.length) return Promise.reject(new ValidationError({ items: 'No hay filas seleccionadas' }));
  return db.transaction(async tx => {
    const batchId = uuid();
    await tx.run('INSERT INTO import_batches (id, file_name, account_id, row_count, created_at) VALUES (?, ?, ?, ?, ?)', [
      batchId,
      fileName || null,
      accountId,
      chosen.length,
      stamp(),
    ]);
    for (const item of chosen) {
      try {
        await insertTransaction(tx, {
          kind: item.kind,
          amount: item.amount,
          account_id: accountId,
          category_id: item.category_id,
          payment_method: item.kind === 'expense' ? null : undefined,
          description: item.description,
          occurred_at: item.occurred_at,
          external_id: item.external_id,
          import_batch_id: batchId,
          origin: 'csv',
          income_type: item.kind === 'income' ? 'other' : undefined,
        });
      } catch (e) {
        const msg = e.fields ? Object.values(e.fields).join('; ') : e.message;
        throw new ValidationError({ items: `Fila ${item.rowIndex + 1}: ${msg}. No se importó nada.` });
      }
    }
    return { batchId, imported: chosen.length };
  });
}

/** Deshace una importación completa (por lote). */
export function undoImport(db, batchId) {
  return db.transaction(async tx => {
    const res = await tx.run('DELETE FROM transactions WHERE import_batch_id = ?', [batchId]);
    await tx.run('DELETE FROM import_batches WHERE id = ?', [batchId]);
    return res.changes;
  });
}
