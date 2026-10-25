/**
 * Recomendador de pagos de deuda. Funciones puras y deterministas: la IA
 * nunca calcula importes.
 *
 * Distingue siempre cuatro cifras:
 *  1. recomendado  -> lo que se sugiere apartar/pagar por periodo (cálculo)
 *  2. apartado     -> dinero efectivamente reservado por el usuario
 *  3. pagado       -> pagos registrados
 *  4. pendiente    -> saldo de la deuda
 * Ninguna recomendación crea movimientos ni reduce la deuda.
 */
import { splitEvenly, sum } from '../../utils/money';
import { addDays, addMonths, diffDays, formatDate, isISODate } from '../../utils/dates';
import { nextOccurrence } from '../../utils/periods';

export const PLAN_FREQUENCIES = ['weekly', 'biweekly', 'monthly'];

export const PLAN_LABELS = {
  weekly: 'Semanal',
  biweekly: 'Quincenal',
  monthly: 'Mensual',
};

/**
 * Periodo guardado para apartar a una deuda o tarjeta; sin elección, el del
 * círculo financiero (semanal si el círculo no es semanal, quincenal ni mensual).
 */
export function planFrequency(frequencies, id, periodType) {
  const saved = frequencies && frequencies[id];
  if (PLAN_FREQUENCIES.includes(saved)) return saved;
  return PLAN_FREQUENCIES.includes(periodType) ? periodType : 'weekly';
}

const PER_LABEL = { weekly: 'por semana', biweekly: 'por quincena', monthly: 'al mes' };

/** Fechas de aportación entre mañana y la fecha límite (incluida). */
export function paymentDates(today, deadline, frequency) {
  const dates = [];
  if (!isISODate(deadline) || deadline <= today) return [deadline > today ? deadline : today];
  let d = today;
  for (let i = 0; i < 520; i++) {
    if (frequency === 'weekly') d = addDays(d, 7);
    else if (frequency === 'biweekly') d = nextOccurrence(d, 'semimonthly');
    else d = addMonths(today, i + 1);
    if (d > deadline) break;
    dates.push(d);
  }
  // Si el plazo es más corto que un periodo, se aparta todo antes de la fecha límite.
  if (!dates.length) dates.push(deadline);
  // El último tramo hasta la fecha límite cuenta como un periodo más.
  else if (dates[dates.length - 1] < deadline && diffDays(dates[dates.length - 1], deadline) >= 3) dates.push(deadline);
  return dates;
}

/**
 * Plan con importes iguales (en pesos enteros cuando es posible) que suman
 * exactamente lo pendiente.
 */
export function buildPlan({ outstanding, reserved = 0, today, deadline, frequency }) {
  const toCover = Math.max(0, outstanding - Math.max(0, reserved));
  const overdue = isISODate(deadline) && deadline < today;
  const dates = paymentDates(today, deadline, frequency);
  const n = dates.length;
  const unit = toCover >= n * 100 ? 100 : 1;
  const amounts = toCover > 0 ? splitEvenly(toCover, n, unit) : dates.map(() => 0);
  const schedule = dates.map((date, i) => ({ date, amount: amounts[i] }));
  return {
    frequency,
    label: PLAN_LABELS[frequency],
    perLabel: PER_LABEL[frequency],
    outstanding,
    reserved: Math.min(Math.max(0, reserved), outstanding),
    toCover,
    periods: n,
    perPeriod: n ? Math.max(...amounts) : 0,
    schedule,
    total: sum(amounts),
    overdue,
    deadline,
  };
}

export function comparePlans(params) {
  return PLAN_FREQUENCIES.map(frequency => buildPlan({ ...params, frequency }));
}

/**
 * Mensualidades que faltan de una financiación ya decorada (withPayments):
 * los meses del calendario capturado o el pago fijo mes a mes. Sin pago
 * mensual registrado devuelve null: nunca se estima.
 */
export function pendingInstallments(debt) {
  if (debt.schedule) {
    const items = debt.schedule.pending.map(it => ({ date: it.due_date, amount: it.amount }));
    return items.length ? items : null;
  }
  if (!debt.monthlyDue || !debt.effectiveDueDate) return null;
  const day = Number((debt.next_due_date || debt.effectiveDueDate).slice(8, 10));
  const items = [];
  let left = Math.max(0, debt.outstanding || 0);
  for (let i = 0; left > 0 && i < 240; i++) {
    const amount = Math.min(debt.monthly_payment || debt.monthlyDue, left);
    items.push({ date: addMonths(debt.effectiveDueDate, i, day), amount });
    left -= amount;
  }
  return items.length ? items : null;
}

// Aportaciones de cada mensualidad, en días antes de su fecha de pago.
const CYCLE_OFFSETS = { weekly: [-21, -14, -7, 0], biweekly: [-15, 0], monthly: [0] };

// k-ésima fecha de aportación antes de una mensualidad, al ritmo del periodo.
const cycleBack = (date, frequency, k) =>
  frequency === 'monthly' ? addMonths(date, -k) : addDays(date, -k * (frequency === 'weekly' ? 7 : 15));

/**
 * Plan que reparte CADA mensualidad en aportaciones antes de su fecha de pago:
 * $400 al mes = $200 por quincena = $100 por semana. Si para la primera queda
 * menos tiempo, sus aportaciones son menos y más altas. Lo apartado cubre
 * primero las mensualidades más próximas.
 *
 * `perPeriod` es lo que toca para la mensualidad más próxima (con calendario,
 * cada mes es distinto); `later` lista los cambios de importe que siguen.
 */
export function buildInstallmentPlan({ installments, reserved = 0, today, frequency, spreadFirst = false }) {
  const offsets = CYCLE_OFFSETS[frequency];
  // spreadFirst: la mensualidad más próxima se reparte desde hoy (no solo en su ciclo), para empezar a apartar ya.
  let spread = spreadFirst;
  const totalDue = sum(installments.map(i => i.amount));
  let credit = Math.min(Math.max(0, reserved), totalDue);
  const reservedUsed = credit;
  const entries = [];
  let prevDate = null;
  let overdue = false;
  for (const inst of installments) {
    const covered = Math.min(credit, inst.amount);
    credit -= covered;
    const amount = inst.amount - covered;
    const after = prevDate;
    prevDate = inst.date;
    if (amount <= 0) continue;
    if (inst.date < today) overdue = true;
    let dates = offsets.map(o => addDays(inst.date, o)).filter(d => d >= today && (!after || d > after));
    if (spread) {
      spread = false;
      dates = [];
      for (let k = 0, d = inst.date; d >= today && (!after || d > after) && k < 520; d = cycleBack(inst.date, frequency, ++k)) dates.unshift(d);
    }
    if (!dates.length) dates = [inst.date < today ? today : inst.date];
    const unit = amount >= dates.length * 100 ? 100 : 1;
    const parts = splitEvenly(amount, dates.length, unit);
    dates.forEach((date, i) => entries.push({ date, amount: parts[i], dueDate: inst.date }));
  }
  // Mensualidades vencidas caen todas hoy: se juntan en una sola aportación.
  const schedule = [];
  for (const e of entries) {
    const last = schedule[schedule.length - 1];
    if (last && last.date === e.date) last.amount += e.amount;
    else schedule.push({ ...e });
  }
  // Aportación por periodo de cada mensualidad, en orden.
  const cycles = [];
  for (const e of schedule) {
    const last = cycles[cycles.length - 1];
    if (last && last.date === e.dueDate) {
      last.count += 1;
      last.amount = Math.max(last.amount, e.amount);
    } else cycles.push({ date: e.dueDate, count: 1, amount: e.amount });
  }
  const later = [];
  for (let i = 1; i < cycles.length && later.length < 2; i++) {
    const prev = later.length ? later[later.length - 1].amount : cycles[0].amount;
    if (cycles[i].amount !== prev) later.push({ date: cycles[i].date, amount: cycles[i].amount });
  }
  return {
    frequency,
    label: PLAN_LABELS[frequency],
    perLabel: PER_LABEL[frequency],
    mode: 'installments',
    outstanding: totalDue,
    reserved: reservedUsed,
    toCover: totalDue - reservedUsed,
    periods: schedule.length,
    perPeriod: cycles.length ? cycles[0].amount : 0,
    // Mensualidad más próxima: fecha y cuántas aportaciones caben antes (menos que lo normal = queda poco tiempo).
    firstDue: cycles.length ? { ...cycles[0], short: cycles[0].count < offsets.length } : null,
    later,
    schedule: schedule.map(({ date, amount }) => ({ date, amount })),
    total: sum(schedule.map(e => e.amount)),
    overdue,
    deadline: installments.length ? installments[installments.length - 1].date : today,
  };
}

export function compareInstallmentPlans(params) {
  return PLAN_FREQUENCIES.map(frequency => buildInstallmentPlan({ ...params, frequency }));
}

/**
 * Plan a partir de una cantidad cómoda por periodo: cuántos periodos hacen
 * falta y si se termina antes de la fecha límite.
 */
export function planFromAmount({ outstanding, reserved = 0, today, deadline, frequency, amountPerPeriod, installments = null }) {
  const toCover = Math.max(0, outstanding - Math.max(0, reserved));
  if (!Number.isSafeInteger(amountPerPeriod) || amountPerPeriod <= 0) {
    throw new Error('La cantidad por periodo debe ser mayor que cero');
  }
  const schedule = [];
  let left = toCover;
  let d = today;
  for (let i = 0; left > 0 && i < 1040; i++) {
    if (frequency === 'weekly') d = addDays(d, 7);
    else if (frequency === 'biweekly') d = nextOccurrence(d, 'semimonthly');
    else d = addMonths(today, i + 1);
    const amount = Math.min(amountPerPeriod, left);
    schedule.push({ date: d, amount });
    left -= amount;
  }
  const finishDate = schedule.length ? schedule[schedule.length - 1].date : today;
  // Con mensualidades, también debe alcanzar para cada una en su fecha.
  let missedInstallment = null;
  if (installments) {
    let need = -Math.max(0, reserved);
    let saved = 0;
    let idx = 0;
    for (const inst of installments) {
      need += inst.amount;
      while (idx < schedule.length && schedule[idx].date <= inst.date) saved += schedule[idx++].amount;
      if (saved < need) {
        missedInstallment = inst;
        break;
      }
    }
  }
  return {
    frequency,
    perLabel: PER_LABEL[frequency],
    amountPerPeriod,
    toCover,
    periods: schedule.length,
    schedule,
    finishDate,
    meetsDeadline: (!isISODate(deadline) || finishDate <= deadline) && !missedInstallment,
    missedInstallment,
    total: sum(schedule.map(s => s.amount)),
  };
}

/**
 * Evalúa si el plan es asumible con la información disponible.
 *
 * context:
 *   available        dinero líquido no apartado hoy (centavos) | null
 *   incomes          [{date, amount}] ingresos previstos (estimación)
 *   expenses         [{date, amount}] gastos recurrentes previstos
 *   obligations      [{date, amount}] otras deudas con vencimiento
 *   dailySpending    gasto variable medio por día (estimación) | null
 *   interestKnown    boolean
 *
 * Devuelve avisos y datos faltantes; nunca afirma que un plan sea óptimo.
 */
export function assessPlan(plan, context = {}, today) {
  const warnings = [];
  const missing = [];
  const notes = [];
  const {
    available = null,
    incomes = [],
    expenses = [],
    obligations = [],
    dailySpending = null,
    interestKnown = false,
  } = context;

  if (available === null) missing.push('saldos de tus cuentas');
  if (!incomes.length) missing.push('ingresos previstos (configura tu salario u otros ingresos recurrentes)');
  if (dailySpending === null) missing.push('historial de gastos para estimar tu gasto habitual');
  if (!interestKnown) {
    notes.push('No se consideran intereses ni comisiones: la tasa es desconocida o no se aplica en el cálculo.');
  } else {
    notes.push('El cálculo no añade intereses futuros; consulta tu estado de cuenta para el importe exacto.');
  }
  if (plan.overdue) warnings.push('La fecha límite ya pasó: conviene pagar cuanto antes y confirmar el saldo con tu banco.');

  let shortfall = null;
  if (available !== null && plan.schedule.length) {
    const events = [];
    incomes.forEach(e => events.push({ date: e.date, delta: e.amount }));
    expenses.forEach(e => events.push({ date: e.date, delta: -e.amount }));
    obligations.forEach(e => events.push({ date: e.date, delta: -e.amount }));
    plan.schedule.forEach(e => events.push({ date: e.date, delta: -e.amount, plan: true }));
    events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.delta - b.delta));
    let balance = available;
    let lastDate = today;
    for (const e of events) {
      if (dailySpending) balance -= dailySpending * Math.max(0, diffDays(lastDate, e.date));
      lastDate = e.date > lastDate ? e.date : lastDate;
      balance += e.delta;
      if (e.plan && balance < 0 && !shortfall) {
        shortfall = { date: e.date, amount: -balance };
      }
    }
    if (shortfall) {
      warnings.push(
        `Con los datos registrados, el ${formatDate(shortfall.date)} podrías quedarte corto por unos ` +
          `${Math.ceil(shortfall.amount / 100)} pesos. Considera un plazo mayor o una cantidad menor.`,
      );
    }
  }
  const basis = missing.length ? 'arithmetic' : 'cashflow';
  return { warnings, missing, notes, shortfall, basis, estimated: true };
}
