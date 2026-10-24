/**
 * Exportación de movimientos a CSV y respaldo completo en JSON.
 *
 * Formato CSV (UTF-8 con BOM, separador ',', fin de línea CRLF):
 *   id, fecha (YYYY-MM-DD HH:MM:SS local), tipo, importe (decimal con punto,
 *   siempre positivo salvo ajustes), moneda, cuenta, cuenta_destino,
 *   categoria, metodo_pago, descripcion, fuente, etiquetas, deuda, origen,
 *   referencia.
 * Las celdas de texto que empiezan por = + - @ se prefijan con ' para que una
 * hoja de cálculo no las ejecute como fórmula.
 */
import { transactionsRepository } from '../../database/repositories/transactionsRepository';
import { centsToInput } from '../../utils/money';
import { nowDateTime } from '../../utils/dates';

export const EXPORT_COLUMNS = [
  'id', 'fecha', 'tipo', 'importe', 'moneda', 'cuenta', 'cuenta_destino', 'categoria', 'metodo_pago',
  'descripcion', 'fuente', 'etiquetas', 'deuda', 'origen', 'referencia',
];

export function escapeCell(value, { text = true } = {}) {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (text && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function transactionsToCSV(rows) {
  const lines = [EXPORT_COLUMNS.join(',')];
  for (const t of rows) {
    lines.push(
      [
        escapeCell(t.id),
        escapeCell(t.occurred_at),
        escapeCell(t.kind),
        escapeCell(centsToInput(t.amount), { text: false }),
        escapeCell(t.currency),
        escapeCell(t.account_name),
        escapeCell(t.to_account_name),
        escapeCell(t.category_name),
        escapeCell(t.payment_method),
        escapeCell(t.description),
        escapeCell(t.source),
        escapeCell(t.tags),
        escapeCell(t.debt_name),
        escapeCell(t.origin),
        escapeCell(t.external_id),
      ].join(','),
    );
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}

export async function exportTransactionsCSV(db, filters = {}) {
  const rows = [];
  const page = 1000;
  for (let offset = 0; ; offset += page) {
    const chunk = await transactionsRepository.search(db, filters, { limit: page, offset });
    rows.push(...chunk);
    if (chunk.length < page) break;
  }
  return { csv: transactionsToCSV(rows.reverse()), count: rows.length };
}

const BACKUP_TABLES = [
  'accounts', 'categories', 'debts', 'transactions', 'debt_balance_snapshots', 'goals', 'reservations',
  'budgets', 'recurring_rules', 'recurring_occurrences', 'import_batches', 'settings', 'debt_schedule_items',
];

/** Respaldo completo (archivo distinto de la exportación de movimientos). */
export async function buildBackup(db) {
  const data = {};
  for (const t of BACKUP_TABLES) data[t] = await db.all(`SELECT * FROM ${t}`);
  const version = await db.get('SELECT MAX(version) AS v FROM schema_migrations');
  return JSON.stringify({ app: 'AureaFinance', format: 1, schemaVersion: version.v, createdAt: nowDateTime(), data });
}
