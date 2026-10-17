/**
 * Esquema inicial (versión 1).
 *
 * Convenciones:
 * - Importes en centavos (INTEGER). Nunca REAL.
 * - Fechas como texto local 'YYYY-MM-DD' o 'YYYY-MM-DD HH:MM:SS'.
 * - Identificadores TEXT (UUID) para facilitar una sincronización futura.
 * - Los saldos NO se guardan: se calculan a partir de los movimientos, así
 *   editar o eliminar un movimiento nunca deja un saldo desfasado.
 */
export const SCHEMA_V1 = [
  `CREATE TABLE accounts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    type TEXT NOT NULL CHECK (type IN ('cash','debit','savings','credit','other')),
    institution TEXT,
    currency TEXT NOT NULL DEFAULT 'MXN',
    -- Saldo con signo al inicio. En crédito, una deuda inicial es negativa.
    initial_balance INTEGER NOT NULL DEFAULT 0,
    initial_balance_date TEXT NOT NULL,
    credit_limit INTEGER CHECK (credit_limit IS NULL OR credit_limit > 0),
    statement_day INTEGER CHECK (statement_day IS NULL OR statement_day BETWEEN 1 AND 31),
    payment_due_day INTEGER CHECK (payment_due_day IS NULL OR payment_due_day BETWEEN 1 AND 31),
    color TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
    include_in_liquid INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,

  `CREATE TABLE categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    color TEXT NOT NULL,
    icon TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('expense','income','both')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
    is_system INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,

  `CREATE TABLE debts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
    financing_type TEXT NOT NULL DEFAULT 'other'
      CHECK (financing_type IN ('msi','installments','revolving','loan','other')),
    monthly_payment INTEGER CHECK (monthly_payment IS NULL OR monthly_payment > 0),
    next_due_date TEXT,
    statement_day INTEGER CHECK (statement_day IS NULL OR statement_day BETWEEN 1 AND 31),
    installments_remaining INTEGER CHECK (installments_remaining IS NULL OR installments_remaining >= 0),
    -- Tasa anual en puntos básicos (2350 = 23.50 %). NULL = desconocida.
    interest_rate_bp INTEGER CHECK (interest_rate_bp IS NULL OR interest_rate_bp >= 0),
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paid','archived')),
    origin_transaction_id TEXT,
    currency TEXT NOT NULL DEFAULT 'MXN',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,

  `CREATE TABLE transactions (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('expense','income','transfer','card_payment','refund','adjustment')),
    amount INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'MXN',
    account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    to_account_id TEXT REFERENCES accounts(id) ON DELETE RESTRICT,
    category_id TEXT REFERENCES categories(id) ON DELETE RESTRICT,
    payment_method TEXT CHECK (payment_method IS NULL OR payment_method IN ('cash','debit','credit','transfer','other')),
    income_type TEXT CHECK (income_type IS NULL OR income_type IN ('salary','extra','refund','other')),
    source TEXT,
    description TEXT,
    tags TEXT,
    occurred_at TEXT NOT NULL,
    debt_id TEXT REFERENCES debts(id) ON DELETE SET NULL,
    related_transaction_id TEXT REFERENCES transactions(id) ON DELETE SET NULL,
    recurring_occurrence_id TEXT,
    origin TEXT NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual','csv','recurring','recurring_auto')),
    external_id TEXT,
    import_batch_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK ((kind = 'adjustment' AND amount <> 0) OR (kind <> 'adjustment' AND amount > 0)),
    CHECK ((kind IN ('transfer','card_payment')) = (to_account_id IS NOT NULL)),
    CHECK (to_account_id IS NULL OR to_account_id <> account_id),
    CHECK (kind NOT IN ('expense','refund') OR category_id IS NOT NULL)
  )`,
  'CREATE INDEX idx_tx_occurred ON transactions(occurred_at)',
  'CREATE INDEX idx_tx_account ON transactions(account_id, occurred_at)',
  'CREATE INDEX idx_tx_to_account ON transactions(to_account_id, occurred_at)',
  'CREATE INDEX idx_tx_category ON transactions(category_id, occurred_at)',
  'CREATE INDEX idx_tx_kind ON transactions(kind, occurred_at)',
  'CREATE INDEX idx_tx_debt ON transactions(debt_id)',
  'CREATE INDEX idx_tx_external ON transactions(external_id)',
  'CREATE INDEX idx_tx_related ON transactions(related_transaction_id)',

  `CREATE TABLE debt_balance_snapshots (
    id TEXT PRIMARY KEY,
    debt_id TEXT NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
    balance INTEGER NOT NULL CHECK (balance >= 0),
    recorded_at TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('initial','reconciliation')),
    note TEXT,
    created_at TEXT NOT NULL
  )`,
  'CREATE INDEX idx_snap_debt ON debt_balance_snapshots(debt_id, recorded_at)',

  `CREATE TABLE goals (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    target_amount INTEGER NOT NULL CHECK (target_amount > 0),
    deadline TEXT,
    mode TEXT NOT NULL DEFAULT 'virtual' CHECK (mode IN ('virtual','account')),
    account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
    color TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','archived')),
    currency TEXT NOT NULL DEFAULT 'MXN',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,

  /* Dinero apartado para una deuda o meta. Positivo = apartar, negativo = liberar. */
  `CREATE TABLE reservations (
    id TEXT PRIMARY KEY,
    target_type TEXT NOT NULL CHECK (target_type IN ('debt','goal')),
    target_id TEXT NOT NULL,
    amount INTEGER NOT NULL CHECK (amount <> 0),
    account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
    transaction_id TEXT REFERENCES transactions(id) ON DELETE CASCADE,
    occurred_at TEXT NOT NULL,
    note TEXT,
    created_at TEXT NOT NULL
  )`,
  'CREATE INDEX idx_res_target ON reservations(target_type, target_id)',

  `CREATE TABLE budgets (
    id TEXT PRIMARY KEY,
    category_id TEXT REFERENCES categories(id) ON DELETE CASCADE,
    period_type TEXT NOT NULL CHECK (period_type IN ('weekly','biweekly','monthly')),
    amount INTEGER NOT NULL CHECK (amount > 0),
    thresholds TEXT NOT NULL DEFAULT '50,80,100',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  "CREATE UNIQUE INDEX idx_budget_unique ON budgets(COALESCE(category_id, ''), period_type)",

  `CREATE TABLE recurring_rules (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('income','expense')),
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    amount INTEGER NOT NULL CHECK (amount > 0),
    account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
    category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
    payment_method TEXT,
    income_type TEXT,
    frequency TEXT NOT NULL CHECK (frequency IN ('daily','weekly','biweekly','semimonthly','monthly','yearly','custom')),
    interval_days INTEGER,
    start_date TEXT NOT NULL,
    end_date TEXT,
    auto_post INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused')),
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,

  `CREATE TABLE recurring_occurrences (
    id TEXT PRIMARY KEY,
    rule_id TEXT NOT NULL REFERENCES recurring_rules(id) ON DELETE CASCADE,
    due_date TEXT NOT NULL,
    amount INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','skipped')),
    transaction_id TEXT REFERENCES transactions(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    UNIQUE (rule_id, due_date)
  )`,
  'CREATE INDEX idx_occ_due ON recurring_occurrences(status, due_date)',

  `CREATE TABLE import_batches (
    id TEXT PRIMARY KEY,
    file_name TEXT,
    account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
    row_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )`,

  `CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,

  /* Evita notificaciones repetidas para una misma alerta. */
  `CREATE TABLE notification_log (
    key TEXT PRIMARY KEY,
    created_at TEXT NOT NULL
  )`,

  /* Registro de cambios para una futura sincronización (Supabase). */
  `CREATE TABLE change_log (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name TEXT NOT NULL,
    row_id TEXT NOT NULL,
    op TEXT NOT NULL CHECK (op IN ('insert','update','delete')),
    changed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S','now','localtime')),
    synced_at TEXT
  )`,
  'CREATE INDEX idx_change_pending ON change_log(synced_at, seq)',
];

const SYNCED_TABLES = [
  'accounts',
  'categories',
  'debts',
  'transactions',
  'debt_balance_snapshots',
  'goals',
  'reservations',
  'budgets',
  'recurring_rules',
  'recurring_occurrences',
];

for (const table of SYNCED_TABLES) {
  for (const [op, ref] of [
    ['insert', 'NEW'],
    ['update', 'NEW'],
    ['delete', 'OLD'],
  ]) {
    SCHEMA_V1.push(
      `CREATE TRIGGER trg_${table}_${op} AFTER ${op.toUpperCase()} ON ${table}
       BEGIN INSERT INTO change_log(table_name, row_id, op) VALUES ('${table}', ${ref}.id, '${op}'); END`,
    );
  }
}
