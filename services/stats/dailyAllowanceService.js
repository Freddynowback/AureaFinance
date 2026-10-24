/**
 * "¿Cuánto puedo gastar hoy?": lo libre hasta el próximo ingreso, repartido
 * en partes iguales entre los días que faltan. Se recalcula cada vez, así que
 * lo que un día se gasta de más (o de menos) se reparte solo en los días
 * restantes.
 *
 *   libre   = dinero disponible − pagos que vencen antes del próximo ingreso
 *             − compras con tarjeta desde el último ingreso (si esa tarjeta
 *               vence después) − colchón − gastos planeados
 *   por día = libre ÷ días hasta el próximo ingreso
 *
 * Solo usa la FECHA del próximo ingreso, no su monto: ese dinero aún no llega.
 * Las compras financiadas (a meses) no cuentan: cuenta su mensualidad.
 */
import { plannedSpendsRepository } from '../../database/repositories/plannedSpendsRepository';
import { recurringRepository } from '../../database/repositories/recurringRepository';
import { addDays, diffDays, isISODate, todayISO, stamp } from '../../utils/dates';
import { uuid } from '../../utils/id';
import { check, throwIfErrors } from '../../utils/errors';
import { getPeriod } from '../../utils/periods';
import { getAccountsOverview } from '../accounts/accountService';
import { loadDebtsWithPayments } from '../debts/schedule';

// Días después del ingreso en los que se avisa de lo que ese ingreso debe cubrir.
const AFTER_INCOME_DAYS = 16;
const FINANCED = 'SELECT origin_transaction_id FROM debts WHERE origin_transaction_id IS NOT NULL';

/** Gasto neto (gastos − devoluciones) entre dos fechas, sin compras financiadas. */
async function netSpending(db, from, to, { creditOnly = false, accountIds } = {}) {
  const where = ['t.occurred_at >= ?', 't.occurred_at < ?', `t.id NOT IN (${FINANCED})`];
  const params = [from, to];
  if (creditOnly) where.push("a.type = 'credit'");
  if (accountIds) {
    if (!accountIds.length) return 0;
    where.push(`t.account_id IN (${accountIds.map(() => '?').join(', ')})`);
    params.push(...accountIds);
  }
  const row = await db.get(
    `SELECT COALESCE(SUM(CASE WHEN t.kind = 'expense' THEN t.amount WHEN t.kind = 'refund' THEN -t.amount END), 0) AS net
     FROM transactions t JOIN accounts a ON a.id = t.account_id
     WHERE ${where.join(' AND ')}`,
    params,
  );
  return row.net;
}

/**
 * Hasta cuándo se reparte: el próximo ingreso previsto después de hoy o, sin
 * ingresos, el fin del periodo. Un ingreso de hoy o atrasado sin confirmar no
 * se cuenta (el dinero aún no está registrado): se avisa y se reparte hasta el
 * siguiente.
 */
async function findHorizon(db, today, periodSettings) {
  const incomes = await recurringRepository.occurrences(db, { from: addDays(today, -31), to: addDays(today, 62), kind: 'income' });
  const pendingNow = incomes.find(o => o.due_date <= today) || null;
  const next = incomes.find(o => o.due_date > today);
  if (next) return { horizon: next.due_date, source: 'income', income: next, pendingIncome: pendingNow };
  const period = getPeriod(today, periodSettings);
  return { horizon: period.end > today ? period.end : addDays(today, 1), source: 'period', income: null, pendingIncome: pendingNow };
}

/** Desde cuándo cuentan las compras con tarjeta: el último ingreso recibido o el inicio del periodo. */
async function windowStart(db, today, periodSettings) {
  const row = await db.get(
    "SELECT MAX(occurred_at) AS d FROM transactions WHERE kind = 'income' AND occurred_at >= ? AND occurred_at < ?",
    [addDays(today, -45), addDays(today, 1)],
  );
  if (row && row.d) return row.d.slice(0, 10);
  const period = getPeriod(today, periodSettings);
  return period.start < today ? period.start : today;
}

export async function getDailyAllowance(db, { today = todayISO(), periodSettings, cushion = 0 } = {}) {
  const { horizon, source, income, pendingIncome } = await findHorizon(db, today, periodSettings);
  const days = Math.max(1, diffDays(today, horizon));
  const [overview, debts, expenses, planned, since] = await Promise.all([
    getAccountsOverview(db, today),
    loadDebtsWithPayments(db, undefined, today),
    recurringRepository.occurrences(db, { from: addDays(today, -7), to: addDays(horizon, -1), kind: 'expense' }),
    plannedSpendsRepository.list(db, { from: today, to: horizon }),
    windowStart(db, today, periodSettings),
  ]);

  const commitments = [];
  const afterIncome = [];
  const cards = overview.accounts.filter(a => a.type === 'credit' && a.currency === overview.currency && a.status !== 'archived');
  const cardsLater = [];
  for (const a of cards) {
    const amount = a.debt > 0 && a.credit ? Math.min(a.credit.dueNow, a.debt) : 0;
    if (a.nextDue && a.nextDue < horizon) {
      if (amount > 0) commitments.push({ type: 'card', name: a.name, date: a.nextDue, amount, accountId: a.id });
    } else {
      cardsLater.push(a.id);
      if (amount > 0 && a.nextDue && a.nextDue < addDays(horizon, AFTER_INCOME_DAYS)) {
        afterIncome.push({ type: 'card', name: a.name, date: a.nextDue, amount, accountId: a.id });
      }
    }
  }
  const creditIds = new Set(cards.map(a => a.id));
  for (const d of debts) {
    // Las financiaciones de una tarjeta ya van dentro del pago de esa tarjeta.
    if (d.status !== 'active' || d.outstanding <= 0 || creditIds.has(d.account_id)) continue;
    if (d.monthlyDue && d.effectiveDueDate && d.effectiveDueDate < horizon) {
      commitments.push({ type: 'debt', name: d.name, date: d.effectiveDueDate, amount: d.monthlyDue, debtId: d.id });
    }
  }
  for (const o of expenses) commitments.push({ type: 'recurring', name: o.name, date: o.due_date, amount: o.amount, occurrenceId: o.id });
  commitments.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));

  const tomorrow = addDays(today, 1);
  const [spentToday, cardSpending] = await Promise.all([
    netSpending(db, today, tomorrow),
    // Con tarjeta también se gasta: si la tarjeta vence después del ingreso, su
    // pago no está en los compromisos y se descuenta aquí.
    netSpending(db, since, tomorrow, { creditOnly: true, accountIds: cardsLater }),
  ]);

  const committed = commitments.reduce((s, c) => s + c.amount, 0);
  const plannedTotal = planned.reduce((s, p) => s + p.amount, 0);
  const plannedToday = planned.filter(p => p.planned_date === today).reduce((s, p) => s + p.amount, 0);
  const safeCushion = Math.max(0, cushion || 0);
  // Libre ahora (ya descontado lo de hoy) y al empezar el día (sumando de vuelta lo gastado hoy).
  const freeNow = overview.available - committed - Math.max(0, cardSpending) - safeCushion;
  const freeStart = freeNow + spentToday;
  const pool = freeStart - plannedTotal;
  const perDay = pool > 0 ? Math.floor(pool / days / 100) * 100 : 0;
  const allowance = Math.max(0, Math.min(perDay + plannedToday, freeStart - (plannedTotal - plannedToday)));
  const shortfall = pool < 0 ? -pool : 0;

  // Si hoy no gastas más: lo que te tocaría mañana.
  let tomorrowPerDay = null;
  let tomorrowAllowance = null;
  if (days > 1) {
    const plannedLater = planned.filter(p => p.planned_date > today).reduce((s, p) => s + p.amount, 0);
    const poolTomorrow = freeNow - plannedLater;
    tomorrowPerDay = poolTomorrow > 0 ? Math.floor(poolTomorrow / (days - 1) / 100) * 100 : 0;
    // Lo de mañana incluye lo planeado para ese día.
    tomorrowAllowance = tomorrowPerDay + planned.filter(p => p.planned_date === tomorrow).reduce((s, p) => s + p.amount, 0);
  }

  return {
    today,
    horizon,
    horizonSource: source, // 'income' | 'period'
    income: income ? { name: income.name, date: income.due_date } : null,
    // Ingreso de hoy o atrasado que aún no confirmas (no se cuenta hasta que lo registres).
    pendingIncome: pendingIncome ? { name: pendingIncome.name, date: pendingIncome.due_date } : null,
    days,
    available: overview.available,
    hasAccounts: overview.hasAccounts,
    commitments,
    committed,
    cardSpending: Math.max(0, cardSpending),
    cardSpendingSince: since,
    cushion: safeCushion,
    planned,
    plannedTotal,
    plannedToday,
    free: freeStart,
    perDay,
    allowance,
    spentToday,
    leftToday: allowance - spentToday,
    tomorrowPerDay,
    tomorrowAllowance,
    shortfall,
    afterIncome,
  };
}

export async function addPlannedSpend(db, input, today = todayISO()) {
  const fields = {};
  check(fields, isISODate(input.planned_date), 'planned_date', 'Elige la fecha');
  check(fields, !isISODate(input.planned_date) || input.planned_date >= today, 'planned_date', 'La fecha ya pasó');
  check(fields, Number.isSafeInteger(input.amount) && input.amount > 0, 'amount', 'Escribe el importe');
  throwIfErrors(fields);
  const row = {
    id: uuid(),
    planned_date: input.planned_date,
    amount: input.amount,
    note: typeof input.note === 'string' && input.note.trim() ? input.note.trim() : null,
    created_at: stamp(),
  };
  await plannedSpendsRepository.insert(db, row);
  return row;
}

export const deletePlannedSpend = (db, id) => plannedSpendsRepository.delete(db, id);
