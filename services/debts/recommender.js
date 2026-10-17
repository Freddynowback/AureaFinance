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
 * Plan a partir de una cantidad cómoda por periodo: cuántos periodos hacen
 * falta y si se termina antes de la fecha límite.
 */
export function planFromAmount({ outstanding, reserved = 0, today, deadline, frequency, amountPerPeriod }) {
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
  return {
    frequency,
    perLabel: PER_LABEL[frequency],
    amountPerPeriod,
    toCover,
    periods: schedule.length,
    schedule,
    finishDate,
    meetsDeadline: !isISODate(deadline) || finishDate <= deadline,
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
