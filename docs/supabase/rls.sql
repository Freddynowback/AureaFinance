-- ESTADO: diseño revisado por Claude, SIN VALIDAR contra un servidor PostgreSQL/Supabase real. Ejecutar primero en un proyecto de pruebas.
-- ==============================================================================
-- rls.sql
-- Políticas de Seguridad a Nivel de Fila (RLS) y Aislamiento Multinquilino
-- ==============================================================================

/*
================================================================================
EXPLICACIÓN DE DISEÑO: AISLAMIENTO ENTRE TENANTS (FK COMPUESTAS VS TRIGGERS)
================================================================================

1. Por qué las FK compuestas (user_id, id) son la elección principal:
   - En PostgreSQL, las restricciones de Foreign Key se evalúan a nivel de sistema
     con privilegios internos, IGNORANDO las políticas de Row Level Security (RLS).
   - Si una FK fuera simple (ej. transactions.account_id -> accounts.id), el Usuario A
     podría asociar un gasto a la cuenta bancaria del Usuario B si conoce o adivina su UUID.
     El motor de Postgres permitiría la inserción porque la fila existe en 'accounts',
     violando la privacidad y permitiendo ataques de oráculo por fuerza bruta de UUIDs.
   - Al usar FKs compuestas:
       FOREIGN KEY (user_id, account_id) REFERENCES accounts(user_id, id)
     PostgreSQL valida a nivel de motor y en el índice B-Tree que la tupla exacta
     (user_id, account_id) exista en la tabla padre. Si el account_id pertenece al
     Usuario B, la tupla ('user_A', 'account_B') no existe y la operación es rechazada
     inmediatamente con error de integridad referencial.
   - Rendimiento: Las FK compuestas son nativas en C en el motor de Postgres y aprovechan
     los índices únicos sin overhead de contexto de funciones procedimentales.

2. Caso especial: Triggers de validación para referencias polimórficas:
   - En la tabla 'reservations', la columna 'target_id' apunta dinámicamente a 'debts'
     o a 'goals' según el valor de 'target_type'.
   - El estándar SQL y PostgreSQL no admiten FKs polimórficas directas entre tablas distintas.
   - Para este caso específico se implementa un TRIGGER de validación que verifica
     que el registro referenciado en 'debts' o 'goals' pertenezca estrictamente al mismo
     'user_id'.

3. Subconsulta escalar (select auth.uid()):
   - Se utiliza `(select auth.uid())` en lugar de `auth.uid()` directamente porque
     PostgreSQL lo evalúa como un subplan escalar único (InitPlan) por sentencia
     en vez de reevaluar la función por cada fila analizada, optimizando drásticamente
     el throughput y el costo de CPU.
================================================================================
*/

-- ------------------------------------------------------------------------------
-- Trigger de validación para relación polimórfica en reservations
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION validate_reservation_target_user()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.target_type = 'debt' THEN
    IF NOT EXISTS (
      SELECT 1 FROM debts
      WHERE id = NEW.target_id AND user_id = NEW.user_id
    ) THEN
      RAISE EXCEPTION 'Violación de aislamiento multinquilino: debt_id % no existe o no pertenece al user_id %',
        NEW.target_id, NEW.user_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  ELSIF NEW.target_type = 'goal' THEN
    IF NOT EXISTS (
      SELECT 1 FROM goals
      WHERE id = NEW.target_id AND user_id = NEW.user_id
    ) THEN
      RAISE EXCEPTION 'Violación de aislamiento multinquilino: goal_id % no existe o no pertenece al user_id %',
        NEW.target_id, NEW.user_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_reservation_target ON reservations;
CREATE TRIGGER trg_validate_reservation_target
  BEFORE INSERT OR UPDATE OF target_id, target_type, user_id
  ON reservations
  FOR EACH ROW
  EXECUTE FUNCTION validate_reservation_target_user();

-- ------------------------------------------------------------------------------
-- Habilitar RLS en todas las tablas sincronizadas
-- ------------------------------------------------------------------------------
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE debts ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE debt_balance_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_occurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- Políticas RLS: accounts
-- ------------------------------------------------------------------------------
CREATE POLICY "accounts_select" ON accounts
  FOR SELECT USING ((select auth.uid()) = user_id);

CREATE POLICY "accounts_insert" ON accounts
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "accounts_update" ON accounts
  FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "accounts_delete" ON accounts
  FOR DELETE USING ((select auth.uid()) = user_id);

-- ------------------------------------------------------------------------------
-- Políticas RLS: categories
-- ------------------------------------------------------------------------------
CREATE POLICY "categories_select" ON categories
  FOR SELECT USING ((select auth.uid()) = user_id);

CREATE POLICY "categories_insert" ON categories
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "categories_update" ON categories
  FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "categories_delete" ON categories
  FOR DELETE USING ((select auth.uid()) = user_id);

-- ------------------------------------------------------------------------------
-- Políticas RLS: debts
-- ------------------------------------------------------------------------------
CREATE POLICY "debts_select" ON debts
  FOR SELECT USING ((select auth.uid()) = user_id);

CREATE POLICY "debts_insert" ON debts
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "debts_update" ON debts
  FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "debts_delete" ON debts
  FOR DELETE USING ((select auth.uid()) = user_id);

-- ------------------------------------------------------------------------------
-- Políticas RLS: transactions
-- ------------------------------------------------------------------------------
CREATE POLICY "transactions_select" ON transactions
  FOR SELECT USING ((select auth.uid()) = user_id);

CREATE POLICY "transactions_insert" ON transactions
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "transactions_update" ON transactions
  FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "transactions_delete" ON transactions
  FOR DELETE USING ((select auth.uid()) = user_id);

-- ------------------------------------------------------------------------------
-- Políticas RLS: debt_balance_snapshots
-- ------------------------------------------------------------------------------
CREATE POLICY "debt_snapshots_select" ON debt_balance_snapshots
  FOR SELECT USING ((select auth.uid()) = user_id);

CREATE POLICY "debt_snapshots_insert" ON debt_balance_snapshots
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "debt_snapshots_update" ON debt_balance_snapshots
  FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "debt_snapshots_delete" ON debt_balance_snapshots
  FOR DELETE USING ((select auth.uid()) = user_id);

-- ------------------------------------------------------------------------------
-- Políticas RLS: goals
-- ------------------------------------------------------------------------------
CREATE POLICY "goals_select" ON goals
  FOR SELECT USING ((select auth.uid()) = user_id);

CREATE POLICY "goals_insert" ON goals
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "goals_update" ON goals
  FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "goals_delete" ON goals
  FOR DELETE USING ((select auth.uid()) = user_id);

-- ------------------------------------------------------------------------------
-- Políticas RLS: reservations
-- ------------------------------------------------------------------------------
CREATE POLICY "reservations_select" ON reservations
  FOR SELECT USING ((select auth.uid()) = user_id);

CREATE POLICY "reservations_insert" ON reservations
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "reservations_update" ON reservations
  FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "reservations_delete" ON reservations
  FOR DELETE USING ((select auth.uid()) = user_id);

-- ------------------------------------------------------------------------------
-- Políticas RLS: budgets
-- ------------------------------------------------------------------------------
CREATE POLICY "budgets_select" ON budgets
  FOR SELECT USING ((select auth.uid()) = user_id);

CREATE POLICY "budgets_insert" ON budgets
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "budgets_update" ON budgets
  FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "budgets_delete" ON budgets
  FOR DELETE USING ((select auth.uid()) = user_id);

-- ------------------------------------------------------------------------------
-- Políticas RLS: recurring_rules
-- ------------------------------------------------------------------------------
CREATE POLICY "recurring_rules_select" ON recurring_rules
  FOR SELECT USING ((select auth.uid()) = user_id);

CREATE POLICY "recurring_rules_insert" ON recurring_rules
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "recurring_rules_update" ON recurring_rules
  FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "recurring_rules_delete" ON recurring_rules
  FOR DELETE USING ((select auth.uid()) = user_id);

-- ------------------------------------------------------------------------------
-- Políticas RLS: recurring_occurrences
-- ------------------------------------------------------------------------------
CREATE POLICY "recurring_occurrences_select" ON recurring_occurrences
  FOR SELECT USING ((select auth.uid()) = user_id);

CREATE POLICY "recurring_occurrences_insert" ON recurring_occurrences
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "recurring_occurrences_update" ON recurring_occurrences
  FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "recurring_occurrences_delete" ON recurring_occurrences
  FOR DELETE USING ((select auth.uid()) = user_id);

-- ------------------------------------------------------------------------------
-- Políticas RLS: settings
-- ------------------------------------------------------------------------------
CREATE POLICY "settings_select" ON settings
  FOR SELECT USING ((select auth.uid()) = user_id);

CREATE POLICY "settings_insert" ON settings
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "settings_update" ON settings
  FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "settings_delete" ON settings
  FOR DELETE USING ((select auth.uid()) = user_id);
