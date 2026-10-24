/**
 * Próximos compromisos: vencimientos de tarjetas, pagos de financiaciones,
 * gastos recurrentes e ingresos esperados. Todo derivado de datos reales.
 */
import { addDays, todayISO } from '../../utils/dates';
import { listDebts } from '../debts/debtService';
import { upcoming } from '../recurring/recurringService';
import { getAccountsOverview } from '../accounts/accountService';

export async function getUpcoming(db, { days = 31, today = todayISO() } = {}) {
  const to = addDays(today, days);
  const [overview, debts, occurrences] = await Promise.all([
    getAccountsOverview(db, today),
    listDebts(db, undefined, today),
    upcoming(db, { from: addDays(today, -7), to }),
  ]);
  const items = [];
  for (const a of overview.accounts) {
    // Solo hay pago que avisar si la tarjeta tiene deuda.
    if (a.type === 'credit' && a.nextDue && a.nextDue <= to && a.debt > 0) {
      // Lo que toca pagar: lo no financiado + las mensualidades del mes, no la
      // deuda total (que incluye el saldo completo de cada financiación).
      const c = a.credit;
      items.push({
        type: 'card_due', date: a.nextDue, title: `Vence ${a.name}`, amount: c.dueNow,
        amountIsEstimate: c.plansWithoutMonthly > 0, accountId: a.id,
        breakdown: {
          revolving: c.revolving,
          monthlyDue: c.monthlyDue,
          plansCount: c.plansCount,
          plansWithoutMonthly: c.plansWithoutMonthly,
          totalDebt: a.debt,
        },
      });
    }
  }
  for (const d of debts) {
    if (d.effectiveDueDate && d.effectiveDueDate <= to && d.outstanding > 0) {
      items.push({
        type: 'debt_due', date: d.effectiveDueDate, title: d.name,
        amount: d.monthlyDue !== null ? d.monthlyDue : d.outstanding,
        amountIsEstimate: d.monthlyDue === null, debtId: d.id,
      });
    }
  }
  for (const o of occurrences) {
    items.push({
      type: o.kind === 'income' ? 'expected_income' : 'recurring_expense',
      date: o.due_date, title: o.name, amount: o.amount, occurrenceId: o.id,
      overdue: o.due_date < today, amountIsEstimate: false,
    });
  }
  items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const outgoing = items.filter(i => i.type !== 'expected_income' && i.date >= today);
  return {
    items,
    nextPayment: outgoing[0] || null,
    nextCardDue: items.find(i => i.type === 'card_due' && i.date >= today) || null,
    overview,
  };
}
