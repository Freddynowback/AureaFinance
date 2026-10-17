-- ESTADO: diseño revisado por Claude, SIN VALIDAR contra un servidor PostgreSQL/Supabase real. Ejecutar primero en un proyecto de pruebas.
-- ==============================================================================
-- schema.sql
-- Base de datos remota en Supabase (PostgreSQL) para AureaFinance
-- Derivada de schema-sqlite-v1.js (fuente de verdad local)
-- ==============================================================================

-- Si se ejecuta en un PostgreSQL local o entorno de pruebas sin Supabase:
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);

-- Función para actualizar automáticamente el campo updated_at en modificaciones
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------------------------
-- 1. accounts
-- ------------------------------------------------------------------------------
CREATE TABLE accounts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  type text NOT NULL CHECK (type IN ('cash','debit','savings','credit','other')),
  institution text,
  currency text NOT NULL DEFAULT 'MXN',
  -- Importes en centavos (BIGINT). Nunca numeric ni float.
  initial_balance bigint NOT NULL DEFAULT 0,
  initial_balance_date date NOT NULL,
  credit_limit bigint CHECK (credit_limit IS NULL OR credit_limit > 0),
  statement_day integer CHECK (statement_day IS NULL OR statement_day BETWEEN 1 AND 31),
  payment_due_day integer CHECK (payment_due_day IS NULL OR payment_due_day BETWEEN 1 AND 31),
  color text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  include_in_liquid boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT accounts_pkey PRIMARY KEY (id),
  CONSTRAINT accounts_user_id_id_unq UNIQUE (user_id, id)
);

CREATE TRIGGER trg_accounts_updated_at
  BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_accounts_user_updated ON accounts(user_id, updated_at);
CREATE INDEX idx_accounts_user_status ON accounts(user_id, status);

-- ------------------------------------------------------------------------------
-- 2. categories
-- ------------------------------------------------------------------------------
CREATE TABLE categories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  color text NOT NULL,
  icon text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('expense','income','both')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  is_system boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT categories_pkey PRIMARY KEY (id),
  CONSTRAINT categories_user_id_id_unq UNIQUE (user_id, id)
);

CREATE TRIGGER trg_categories_updated_at
  BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_categories_user_updated ON categories(user_id, updated_at);
CREATE INDEX idx_categories_user_kind ON categories(user_id, kind);

-- ------------------------------------------------------------------------------
-- 3. debts
-- ------------------------------------------------------------------------------
CREATE TABLE debts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  account_id uuid,
  financing_type text NOT NULL DEFAULT 'other'
    CHECK (financing_type IN ('msi','installments','revolving','loan','other')),
  monthly_payment bigint CHECK (monthly_payment IS NULL OR monthly_payment > 0),
  next_due_date date,
  statement_day integer CHECK (statement_day IS NULL OR statement_day BETWEEN 1 AND 31),
  installments_remaining integer CHECK (installments_remaining IS NULL OR installments_remaining >= 0),
  interest_rate_bp integer CHECK (interest_rate_bp IS NULL OR interest_rate_bp >= 0),
  notes text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paid','archived')),
  origin_transaction_id uuid,
  currency text NOT NULL DEFAULT 'MXN',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT debts_pkey PRIMARY KEY (id),
  CONSTRAINT debts_user_id_id_unq UNIQUE (user_id, id),
  CONSTRAINT debts_account_fk FOREIGN KEY (user_id, account_id)
    REFERENCES accounts(user_id, id) ON DELETE SET NULL (account_id)
);

CREATE TRIGGER trg_debts_updated_at
  BEFORE UPDATE ON debts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_debts_user_updated ON debts(user_id, updated_at);
CREATE INDEX idx_debts_user_account ON debts(user_id, account_id);

-- ------------------------------------------------------------------------------
-- 4. transactions
-- ------------------------------------------------------------------------------
CREATE TABLE transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('expense','income','transfer','card_payment','refund','adjustment')),
  amount bigint NOT NULL,
  currency text NOT NULL DEFAULT 'MXN',
  account_id uuid NOT NULL,
  to_account_id uuid,
  category_id uuid,
  payment_method text CHECK (payment_method IS NULL OR payment_method IN ('cash','debit','credit','transfer','other')),
  income_type text CHECK (income_type IS NULL OR income_type IN ('salary','extra','refund','other')),
  source text,
  description text,
  tags text,
  occurred_at timestamptz NOT NULL,
  debt_id uuid,
  related_transaction_id uuid,
  recurring_occurrence_id uuid,
  origin text NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual','csv','recurring','recurring_auto')),
  external_id text,
  import_batch_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT transactions_pkey PRIMARY KEY (id),
  CONSTRAINT transactions_user_id_id_unq UNIQUE (user_id, id),
  CONSTRAINT tx_account_fk FOREIGN KEY (user_id, account_id)
    REFERENCES accounts(user_id, id) ON DELETE RESTRICT,
  CONSTRAINT tx_to_account_fk FOREIGN KEY (user_id, to_account_id)
    REFERENCES accounts(user_id, id) ON DELETE RESTRICT,
  CONSTRAINT tx_category_fk FOREIGN KEY (user_id, category_id)
    REFERENCES categories(user_id, id) ON DELETE RESTRICT,
  CONSTRAINT tx_debt_fk FOREIGN KEY (user_id, debt_id)
    REFERENCES debts(user_id, id) ON DELETE SET NULL (debt_id),
  CONSTRAINT tx_related_fk FOREIGN KEY (user_id, related_transaction_id)
    REFERENCES transactions(user_id, id) ON DELETE SET NULL (related_transaction_id),
  CHECK ((kind = 'adjustment' AND amount <> 0) OR (kind <> 'adjustment' AND amount > 0)),
  CHECK ((kind IN ('transfer','card_payment') AND to_account_id IS NOT NULL) OR (kind NOT IN ('transfer','card_payment') AND to_account_id IS NULL)),
  CHECK (to_account_id IS NULL OR to_account_id <> account_id),
  CHECK (kind NOT IN ('expense','refund') OR category_id IS NOT NULL)
);

CREATE TRIGGER trg_transactions_updated_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_transactions_user_updated ON transactions(user_id, updated_at);
CREATE INDEX idx_transactions_user_occurred ON transactions(user_id, occurred_at);
CREATE INDEX idx_transactions_user_account ON transactions(user_id, account_id, occurred_at);
CREATE INDEX idx_transactions_user_to_account ON transactions(user_id, to_account_id, occurred_at);
CREATE INDEX idx_transactions_user_category ON transactions(user_id, category_id, occurred_at);
CREATE INDEX idx_transactions_user_kind ON transactions(user_id, kind, occurred_at);
CREATE INDEX idx_transactions_user_debt ON transactions(user_id, debt_id);
CREATE INDEX idx_transactions_user_external ON transactions(user_id, external_id);
CREATE INDEX idx_transactions_user_related ON transactions(user_id, related_transaction_id);

-- ------------------------------------------------------------------------------
-- 5. debt_balance_snapshots
-- ------------------------------------------------------------------------------
CREATE TABLE debt_balance_snapshots (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  debt_id uuid NOT NULL,
  balance bigint NOT NULL CHECK (balance >= 0),
  recorded_at timestamptz NOT NULL,
  kind text NOT NULL CHECK (kind IN ('initial','reconciliation')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT debt_balance_snapshots_pkey PRIMARY KEY (id),
  CONSTRAINT debt_balance_snapshots_user_id_id_unq UNIQUE (user_id, id),
  CONSTRAINT debt_snapshots_debt_fk FOREIGN KEY (user_id, debt_id)
    REFERENCES debts(user_id, id) ON DELETE CASCADE
);

CREATE TRIGGER trg_debt_balance_snapshots_updated_at
  BEFORE UPDATE ON debt_balance_snapshots
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_debt_balance_snapshots_user_updated ON debt_balance_snapshots(user_id, updated_at);
CREATE INDEX idx_debt_balance_snapshots_user_debt ON debt_balance_snapshots(user_id, debt_id, recorded_at);

-- ------------------------------------------------------------------------------
-- 6. goals
-- ------------------------------------------------------------------------------
CREATE TABLE goals (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  target_amount bigint NOT NULL CHECK (target_amount > 0),
  deadline date,
  mode text NOT NULL DEFAULT 'virtual' CHECK (mode IN ('virtual','account')),
  account_id uuid,
  color text,
  notes text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','archived')),
  currency text NOT NULL DEFAULT 'MXN',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT goals_pkey PRIMARY KEY (id),
  CONSTRAINT goals_user_id_id_unq UNIQUE (user_id, id),
  CONSTRAINT goals_account_fk FOREIGN KEY (user_id, account_id)
    REFERENCES accounts(user_id, id) ON DELETE SET NULL (account_id)
);

CREATE TRIGGER trg_goals_updated_at
  BEFORE UPDATE ON goals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_goals_user_updated ON goals(user_id, updated_at);
CREATE INDEX idx_goals_user_status ON goals(user_id, status);

-- ------------------------------------------------------------------------------
-- 7. reservations
-- ------------------------------------------------------------------------------
CREATE TABLE reservations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('debt','goal')),
  target_id uuid NOT NULL,
  amount bigint NOT NULL CHECK (amount <> 0),
  account_id uuid,
  transaction_id uuid,
  occurred_at timestamptz NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT reservations_pkey PRIMARY KEY (id),
  CONSTRAINT reservations_user_id_id_unq UNIQUE (user_id, id),
  CONSTRAINT reservations_account_fk FOREIGN KEY (user_id, account_id)
    REFERENCES accounts(user_id, id) ON DELETE SET NULL (account_id),
  CONSTRAINT reservations_tx_fk FOREIGN KEY (user_id, transaction_id)
    REFERENCES transactions(user_id, id) ON DELETE CASCADE
);

CREATE TRIGGER trg_reservations_updated_at
  BEFORE UPDATE ON reservations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_reservations_user_updated ON reservations(user_id, updated_at);
CREATE INDEX idx_reservations_user_target ON reservations(user_id, target_type, target_id);

-- ------------------------------------------------------------------------------
-- 8. budgets
-- ------------------------------------------------------------------------------
CREATE TABLE budgets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id uuid,
  period_type text NOT NULL CHECK (period_type IN ('weekly','biweekly','monthly')),
  amount bigint NOT NULL CHECK (amount > 0),
  thresholds text NOT NULL DEFAULT '50,80,100',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT budgets_pkey PRIMARY KEY (id),
  CONSTRAINT budgets_user_id_id_unq UNIQUE (user_id, id),
  CONSTRAINT budgets_category_fk FOREIGN KEY (user_id, category_id)
    REFERENCES categories(user_id, id) ON DELETE CASCADE
);

CREATE TRIGGER trg_budgets_updated_at
  BEFORE UPDATE ON budgets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_budgets_user_updated ON budgets(user_id, updated_at);
-- Índice único condicional para permitir reactivación y soft deletes
CREATE UNIQUE INDEX idx_budgets_user_cat_period
  ON budgets(user_id, COALESCE(category_id, '00000000-0000-0000-0000-000000000000'::uuid), period_type)
  WHERE deleted_at IS NULL;

-- ------------------------------------------------------------------------------
-- 9. recurring_rules
-- ------------------------------------------------------------------------------
CREATE TABLE recurring_rules (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('income','expense')),
  name text NOT NULL CHECK (length(trim(name)) > 0),
  amount bigint NOT NULL CHECK (amount > 0),
  account_id uuid,
  category_id uuid,
  payment_method text,
  income_type text,
  frequency text NOT NULL CHECK (frequency IN ('daily','weekly','biweekly','semimonthly','monthly','yearly','custom')),
  interval_days integer,
  start_date date NOT NULL,
  end_date date,
  auto_post boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT recurring_rules_pkey PRIMARY KEY (id),
  CONSTRAINT recurring_rules_user_id_id_unq UNIQUE (user_id, id),
  CONSTRAINT recurring_rules_account_fk FOREIGN KEY (user_id, account_id)
    REFERENCES accounts(user_id, id) ON DELETE SET NULL (account_id),
  CONSTRAINT recurring_rules_category_fk FOREIGN KEY (user_id, category_id)
    REFERENCES categories(user_id, id) ON DELETE SET NULL (category_id)
);

CREATE TRIGGER trg_recurring_rules_updated_at
  BEFORE UPDATE ON recurring_rules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_recurring_rules_user_updated ON recurring_rules(user_id, updated_at);

-- ------------------------------------------------------------------------------
-- 10. recurring_occurrences
-- ------------------------------------------------------------------------------
CREATE TABLE recurring_occurrences (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rule_id uuid NOT NULL,
  due_date date NOT NULL,
  amount bigint NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','skipped')),
  transaction_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT recurring_occurrences_pkey PRIMARY KEY (id),
  CONSTRAINT recurring_occurrences_user_id_id_unq UNIQUE (user_id, id),
  CONSTRAINT recurring_occ_rule_fk FOREIGN KEY (user_id, rule_id)
    REFERENCES recurring_rules(user_id, id) ON DELETE CASCADE,
  CONSTRAINT recurring_occ_tx_fk FOREIGN KEY (user_id, transaction_id)
    REFERENCES transactions(user_id, id) ON DELETE SET NULL (transaction_id)
);

CREATE TRIGGER trg_recurring_occurrences_updated_at
  BEFORE UPDATE ON recurring_occurrences
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_recurring_occurrences_user_updated ON recurring_occurrences(user_id, updated_at);
CREATE INDEX idx_recurring_occurrences_user_due ON recurring_occurrences(user_id, status, due_date);
CREATE UNIQUE INDEX idx_recurring_occ_user_rule_due
  ON recurring_occurrences(user_id, rule_id, due_date)
  WHERE deleted_at IS NULL;

-- ------------------------------------------------------------------------------
-- 11. settings
-- ------------------------------------------------------------------------------
CREATE TABLE settings (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key text NOT NULL,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT settings_pkey PRIMARY KEY (user_id, key)
);

CREATE TRIGGER trg_settings_updated_at
  BEFORE UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_settings_user_updated ON settings(user_id, updated_at);
