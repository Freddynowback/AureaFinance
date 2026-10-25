/**
 * "¿Cuánto puedo gastar hoy?": lo libre hasta el próximo ingreso, repartido
 * en partes iguales entre los días que faltan. Se recalcula cada vez, así que
 * lo que un día se gasta de más (o de menos) se reparte solo en los días
 * restantes.
 *
 *   libre   = dinero disponible − lo que toca apartar antes del próximo
 *             ingreso − colchón − gastos planeados
 *   por día = libre ÷ días hasta el próximo ingreso
 *
 * "Lo que toca apartar" sale del plan de pago de cada tarjeta y deuda con el
 * periodo que eligió el usuario (semanal, quincenal o mensual): las
 * aportaciones con fecha antes del ingreso. Lo ya apartado cubre primero.
 * Con `includeLater`, el pago más próximo de cada una se reparte desde hoy:
 * así también aparecen los que vencen mucho después del ingreso.
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
import { buildInstallmentPlan, pendingInstallments, planFrequency } from '../debts/recommender';
import { loadDebtsWithPayments } from '../debts/schedule';

// Días después del ingreso en los que se avisa de lo que ese ingreso debe cubrir.
const AFTER_INCOME_DAYS = 16;
const FINANCED = 'SELECT origin_transaction_id FROM debts WHERE origin_transaction_id IS NOT NULL';

/** Gasto neto (gastos − devoluciones) de un día, sin compras financiadas. */
async function netSpending(db, from, to) {
  const row = await db.get(
    `SELECT COALESCE(SUM(CASE WHEN kind = 'expense' THEN amount WHEN kind = 'refund' THEN -amount END), 0) AS net
     FROM transactions WHERE occurred_at >= ? AND occurred_at < ? AND id NOT IN (${FINANCED})`,
    [from, to],
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

/**
 * Lo que toca apartar antes del horizonte: lo que el plan pide tener apartado
 * para esa fecha menos lo que ya apartaste (si ya apartaste lo de esta semana,
 * no se vuelve a pedir).
 */
function setAsideBefore(installments, reserved, today, frequency, horizon, spreadFirst) {
  const plan = buildInstallmentPlan({ installments, today, frequency, spreadFirst });
  const target = plan.schedule.filter(e => e.date < horizon).reduce((s, e) => s + e.amount, 0);
  return { amount: Math.max(0, target - reserved), toCover: Math.max(0, plan.toCover - reserved), dueDate: plan.firstDue ? plan.firstDue.date : null };
}

export async function getDailyAllowance(db, { today = todayISO(), periodSettings, cushion = 0, frequencies = {}, includeLater = true } = {}) {
  const { horizon, source, income, pendingIncome } = await findHorizon(db, today, periodSettings);
  const days = Math.max(1, diffDays(today, horizon));
  const [overview, debts, expenses, planned] = await Promise.all([
    getAccountsOverview(db, today),
    loadDebtsWithPayments(db, undefined, today),
    recurringRepository.occurrences(db, { from: addDays(today, -7), to: addDays(horizon, -1), kind: 'expense' }),
    plannedSpendsRepository.list(db, { from: today, to: horizon }),
  ]);
  const periodType = periodSettings && periodSettings.type;

  const commitments = [];
  const afterIncome = [];
  // Deudas sin mensualidad capturada: no se estima su parte, solo se avisa.
  const withoutPlan = [];
  const cards = overview.accounts.filter(a => a.type === 'credit' && a.currency === overview.currency && a.status !== 'archived');
  for (const a of cards) {
    // Lo no financiado; cada financiación de la tarjeta va con su propio plan.
    const revolving = a.credit ? Math.min(a.credit.revolving, a.debt) : a.debt;
    if (!(revolving > 0) || !a.nextDue) continue;
    const frequency = planFrequency(frequencies, a.id, periodType);
    const part = setAsideBefore([{ date: a.nextDue, amount: revolving }], 0, today, frequency, horizon, includeLater);
    if (part.amount > 0) commitments.push({ type: 'card', name: a.name, date: a.nextDue, amount: part.amount, frequency, partial: part.amount < revolving, accountId: a.id });
    const left = revolving - part.amount;
    if (left > 0 && a.nextDue < addDays(horizon, AFTER_INCOME_DAYS)) {
      afterIncome.push({ type: 'card', name: a.name, date: a.nextDue, amount: left, accountId: a.id });
    }
  }
  for (const d of debts) {
    if (d.status !== 'active' || d.outstanding <= 0) continue;
    const installments = pendingInstallments(d);
    if (!installments) {
      withoutPlan.push(d.name);
      continue;
    }
    const frequency = planFrequency(frequencies, d.id, periodType);
    const part = setAsideBefore(installments, d.reserved || 0, today, frequency, horizon, includeLater);
    if (part.amount > 0) commitments.push({ type: 'debt', name: d.name, date: part.dueDate, amount: part.amount, frequency, partial: part.amount < part.toCover, debtId: d.id });
  }
  for (const o of expenses) commitments.push({ type: 'recurring', name: o.name, date: o.due_date, amount: o.amount, occurrenceId: o.id });
  commitments.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));

  const tomorrow = addDays(today, 1);
  const spentToday = await netSpending(db, today, tomorrow);

  const committed = commitments.reduce((s, c) => s + c.amount, 0);
  const plannedTotal = planned.reduce((s, p) => s + p.amount, 0);
  const plannedToday = planned.filter(p => p.planned_date === today).reduce((s, p) => s + p.amount, 0);
  const safeCushion = Math.max(0, cushion || 0);
  // Libre ahora (ya descontado lo de hoy) y al empezar el día (sumando de vuelta lo gastado hoy).
  const freeNow = overview.available - committed - safeCushion;
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
    withoutPlan,
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
