/**
 * Cálculo de periodos financieros. Un periodo es { type, start, end } con
 * `start` incluido y `end` excluido, ambos 'YYYY-MM-DD'. Las consultas usan
 * `occurred_at >= start AND occurred_at < end`.
 */
import {
  addDays,
  addMonths,
  addYears,
  dayOfWeek,
  daysInMonth,
  diffDays,
  formatDate,
  formatMonthYear,
  isISODate,
} from './dates';

export const PERIOD_TYPES = ['daily', 'weekly', 'biweekly', 'monthly', 'yearly', 'custom'];

export const PERIOD_LABELS = {
  daily: 'Diario',
  weekly: 'Semanal',
  biweekly: 'Quincenal',
  monthly: 'Mensual',
  yearly: 'Anual',
  custom: 'Personalizado',
};

export const PERIOD_SPENDING_LABELS = {
  daily: 'GASTO DE HOY',
  weekly: 'GASTO SEMANAL',
  biweekly: 'GASTO QUINCENAL',
  monthly: 'GASTO MENSUAL',
  yearly: 'GASTO ANUAL',
  custom: 'GASTO DEL PERIODO',
};

export const DEFAULT_PERIOD_SETTINGS = {
  type: 'weekly',
  weekStartDay: 1, // lunes
  biweeklyMode: 'calendar', // 'calendar' = 1-15 y 16-fin de mes; 'anchor' = cada 14 días
  biweeklyAnchor: null, // 'YYYY-MM-DD' cuando biweeklyMode = 'anchor'
  monthStartDay: 1, // 1-28
  customStart: null,
  customEnd: null, // incluido
};

function pad(n) {
  return String(n).padStart(2, '0');
}

export function getPeriod(ref, settings = DEFAULT_PERIOD_SETTINGS) {
  const s = { ...DEFAULT_PERIOD_SETTINGS, ...settings };
  const type = s.type;
  switch (type) {
    case 'daily':
      return { type, start: ref, end: addDays(ref, 1) };
    case 'weekly': {
      const offset = (dayOfWeek(ref) - s.weekStartDay + 7) % 7;
      const start = addDays(ref, -offset);
      return { type, start, end: addDays(start, 7) };
    }
    case 'biweekly': {
      if (s.biweeklyMode === 'anchor' && isISODate(s.biweeklyAnchor)) {
        const delta = diffDays(s.biweeklyAnchor, ref);
        const k = Math.floor(delta / 14);
        const start = addDays(s.biweeklyAnchor, k * 14);
        return { type, start, end: addDays(start, 14) };
      }
      const [y, m, d] = ref.split('-').map(Number);
      if (d <= 15) {
        return { type, start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-16` };
      }
      return { type, start: `${y}-${pad(m)}-16`, end: addMonths(`${y}-${pad(m)}-01`, 1) };
    }
    case 'monthly': {
      const startDay = Math.min(Math.max(1, s.monthStartDay || 1), 28);
      const [y, m, d] = ref.split('-').map(Number);
      let start = `${y}-${pad(m)}-${pad(startDay)}`;
      if (d < startDay) start = addMonths(start, -1);
      return { type, start, end: addMonths(start, 1) };
    }
    case 'yearly': {
      const y = ref.slice(0, 4);
      return { type, start: `${y}-01-01`, end: `${Number(y) + 1}-01-01` };
    }
    case 'custom': {
      if (isISODate(s.customStart) && isISODate(s.customEnd) && s.customStart <= s.customEnd) {
        return { type, start: s.customStart, end: addDays(s.customEnd, 1) };
      }
      // Sin rango válido se comporta como mensual para no romper la pantalla.
      return { ...getPeriod(ref, { ...s, type: 'monthly' }), type: 'custom', invalid: true };
    }
    default:
      throw new Error(`Tipo de periodo desconocido: ${type}`);
  }
}

/** Periodo anterior (-1) o siguiente (+1) respecto a `period`. */
export function shiftPeriod(period, direction, settings = DEFAULT_PERIOD_SETTINGS) {
  if (period.type === 'custom') {
    const len = diffDays(period.start, period.end);
    const start = addDays(period.start, direction * len);
    return { ...period, start, end: addDays(start, len) };
  }
  const ref = direction < 0 ? addDays(period.start, -1) : period.end;
  return getPeriod(ref, { ...settings, type: period.type });
}

export function periodDays(period) {
  return diffDays(period.start, period.end);
}

export function isInPeriod(dateOrDateTime, period) {
  const d = dateOrDateTime.slice(0, 10);
  return d >= period.start && d < period.end;
}

export function describePeriod(period) {
  const last = addDays(period.end, -1);
  if (period.type === 'daily') return formatDate(period.start, { withWeekday: true });
  if (period.type === 'yearly') return period.start.slice(0, 4);
  if (period.type === 'monthly' && period.start.endsWith('-01')) return formatMonthYear(period.start);
  const sameYear = period.start.slice(0, 4) === last.slice(0, 4);
  return `${formatDate(period.start, { withYear: !sameYear })} – ${formatDate(last)}`;
}

/** Equivalencias aproximadas entre frecuencias, para proyecciones. */
export const DAYS_PER_FREQUENCY = {
  daily: 1,
  weekly: 7,
  biweekly: 14,
  semimonthly: 15.2083,
  monthly: 30.4167,
  yearly: 365,
};

/** Siguiente fecha de una recurrencia. */
export function nextOccurrence(dateISO, frequency, { intervalDays, anchorDay } = {}) {
  switch (frequency) {
    case 'daily':
      return addDays(dateISO, 1);
    case 'weekly':
      return addDays(dateISO, 7);
    case 'biweekly':
      return addDays(dateISO, 14);
    case 'semimonthly': {
      // Quincenas de calendario: día 15 y último día del mes (pago habitual en México).
      const [y, m, d] = dateISO.split('-').map(Number);
      const last = daysInMonth(y, m);
      if (d < 15) return `${y}-${pad(m)}-15`;
      if (d < last) return `${y}-${pad(m)}-${pad(last)}`;
      return addMonths(`${y}-${pad(m)}-01`, 1, 15);
    }
    case 'monthly':
      return addMonths(dateISO, 1, anchorDay);
    case 'yearly':
      return addYears(dateISO, 1);
    case 'custom':
      return addDays(dateISO, Math.max(1, intervalDays || 30));
    default:
      throw new Error(`Frecuencia desconocida: ${frequency}`);
  }
}

export const FREQUENCY_LABELS = {
  daily: 'Diaria',
  weekly: 'Semanal',
  biweekly: 'Cada 14 días',
  semimonthly: 'Quincenal (15 y fin de mes)',
  monthly: 'Mensual',
  yearly: 'Anual',
  custom: 'Personalizada',
};
