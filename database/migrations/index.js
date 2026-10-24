/**
 * Migraciones versionadas. Cada migración se aplica una sola vez, dentro de
 * una transacción, y se registra en schema_migrations. Para cambiar el
 * esquema se añade una nueva entrada al final: nunca se editan las antiguas.
 */
import { SCHEMA_V1 } from '../schema/v1';

const SCHEMA_V2 = [
  // Solo un pago de tarjeta puede vincularse a una deuda (defensa en la BD,
  // además de la validación del servicio).
  `CREATE TRIGGER trg_tx_debt_kind_insert BEFORE INSERT ON transactions
   WHEN NEW.debt_id IS NOT NULL AND NEW.kind <> 'card_payment'
   BEGIN SELECT RAISE(ABORT, 'debt_id solo se permite en pagos de tarjeta'); END`,
  `CREATE TRIGGER trg_tx_debt_kind_update BEFORE UPDATE ON transactions
   WHEN NEW.debt_id IS NOT NULL AND NEW.kind <> 'card_payment'
   BEGIN SELECT RAISE(ABORT, 'debt_id solo se permite en pagos de tarjeta'); END`,
  // La moneda de un movimiento debe ser la de su cuenta.
  `CREATE TRIGGER trg_tx_currency_insert BEFORE INSERT ON transactions
   WHEN NEW.currency <> (SELECT currency FROM accounts WHERE id = NEW.account_id)
   BEGIN SELECT RAISE(ABORT, 'La moneda del movimiento no coincide con la cuenta'); END`,
  'CREATE INDEX IF NOT EXISTS idx_tx_dupes ON transactions(account_id, kind, amount, occurred_at)',
];

const SCHEMA_V3 = [
  // Calendario de pagos capturado a mano (montos distintos por mes). Los meses
  // que faltan definen el saldo pendiente del plan; los pagos vinculados se
  // aplican a los meses más antiguos.
  `CREATE TABLE debt_schedule_items (
    id TEXT PRIMARY KEY,
    debt_id TEXT NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
    due_date TEXT NOT NULL,
    amount INTEGER NOT NULL CHECK (amount > 0),
    created_at TEXT NOT NULL,
    UNIQUE (debt_id, due_date)
  )`,
  'CREATE INDEX idx_schedule_debt ON debt_schedule_items(debt_id, due_date)',
];

export const MIGRATIONS = [
  { version: 1, name: 'esquema_inicial', statements: SCHEMA_V1 },
  { version: 2, name: 'integridad_deuda_moneda', statements: SCHEMA_V2 },
  { version: 3, name: 'calendario_pagos_deuda', statements: SCHEMA_V3 },
];

export const LATEST_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

export async function migrate(db, migrations = MIGRATIONS) {
  await db.run(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       version INTEGER PRIMARY KEY,
       name TEXT NOT NULL,
       applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S','now','localtime'))
     )`,
  );
  const rows = await db.all('SELECT version FROM schema_migrations');
  const applied = new Set(rows.map(r => r.version));
  const pending = migrations.filter(m => !applied.has(m.version)).sort((a, b) => a.version - b.version);
  for (const m of pending) {
    await db.transaction(async tx => {
      await tx.execMany(m.statements);
      await tx.run('INSERT INTO schema_migrations(version, name) VALUES (?, ?)', [m.version, m.name]);
    });
  }
  return pending.map(m => m.version);
}
