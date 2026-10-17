/**
 * Datos reales para evaluar si un plan de pago es asumible (assessPlan).
 * Todo lo previsto se marca como estimación en la interfaz.
 */
import { recurringRepository } from '../../database/repositories/recurringRepository';
import { addMonths, todayISO } from '../../utils/dates';
import { getAccountsOverview } from '../accounts/accountService';
import { averageDailySpending } from '../stats/statsService';
import { occurrenceDates } from '../recurring/recurringService';
import { listDebts } from './debtService';

/** Fechas previstas de reglas activas hasta `horizon`, sin las ya confirmadas u omitidas. */
async function projectedRecurring(db, kind, today, horizon) {
  const rules = (await recurringRepository.listRules(db, { kind })).filter(r => r.status === 'active');
  const done = await db.all(
    "SELECT rule_id, due_date FROM recurring_occurrences WHERE status IN ('confirmed','skipped') AND due_date >= ?",
    [today],
  );
  const closed = new Set(done.map(d => `${d.rule_id}|${d.due_date}`));
  const out = [];
  for (const r of rules) {
    for (const date of occurrenceDates(r, today, horizon)) {
      if (!closed.has(`${r.id}|${date}`)) out.push({ date, amount: r.amount, name: r.name });
    }
  }
  return out;
}

export async function buildDebtContext(db, debtId, { today = todayISO(), deadline } = {}) {
  const horizon = deadline && deadline > today ? deadline : addMonths(today, 1);
  const [overview, incomes, expenses, debts, dailySpending] = await Promise.all([
    getAccountsOverview(db, today),
    projectedRecurring(db, 'income', today, horizon),
    projectedRecurring(db, 'expense', today, horizon),
    listDebts(db),
    averageDailySpending(db, 56, today),
  ]);
  const obligations = [];
  for (const d of debts) {
    if (d.id === debtId || !d.monthly_payment || !d.effectiveDueDate || d.outstanding <= 0) continue;
    let left = d.outstanding;
    for (let date = d.effectiveDueDate, i = 0; date <= horizon && left > 0 && i < 60; i++, date = addMonths(d.effectiveDueDate, i + 1)) {
      const amount = Math.min(d.monthly_payment, left);
      obligations.push({ date, amount, name: d.name });
      left -= amount;
    }
  }
  const debt = debts.find(d => d.id === debtId);
  return {
    available: overview.hasAccounts ? overview.available : null,
    incomes,
    expenses,
    obligations,
    dailySpending,
    interestKnown: !!(debt && debt.interest_rate_bp !== null && debt.interest_rate_bp !== undefined),
  };
}
