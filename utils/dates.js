/**
 * Fechas locales sin zona horaria.
 *
 * Las fechas se guardan como texto local: 'YYYY-MM-DD' para días y
 * 'YYYY-MM-DD HH:MM:SS' para momentos. Así las comparaciones en SQLite son
 * lexicográficas y no dependen de conversiones UTC. México no aplica horario
 * de verano desde 2022, por lo que la hora local del dispositivo es estable.
 *
 * La aritmética de días se hace en UTC sobre fechas "puras" para evitar que
 * un cambio de horario desplace un día.
 */

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MONTHS_LONG = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
export const WEEKDAYS_LONG = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const WEEKDAYS_SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

const pad = n => String(n).padStart(2, '0');

export function isISODate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

export function isISODateTime(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s) && isISODate(s.slice(0, 10));
}

export function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function toUTC(iso) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUTC(ms) {
  const dt = new Date(ms);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** Fecha local del dispositivo. */
export function todayISO(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function nowDateTime(now = new Date()) {
  return `${todayISO(now)} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

export function toDateTime(dateISO, time = '12:00:00') {
  return `${dateISO} ${time}`;
}

export function datePart(dateTime) {
  return dateTime.slice(0, 10);
}

export function timePart(dateTime) {
  return dateTime.length > 10 ? dateTime.slice(11, 16) : '';
}

/** Convierte un Date del selector a 'YYYY-MM-DD HH:MM:SS' local. */
export function dateToDateTime(date) {
  return nowDateTime(date);
}

/** Convierte texto local a Date (para el selector de fecha). */
export function dateTimeToDate(dateTime) {
  const [d, t = '12:00:00'] = dateTime.split(' ');
  const [y, m, day] = d.split('-').map(Number);
  const [hh, mm, ss] = t.split(':').map(Number);
  return new Date(y, m - 1, day, hh || 0, mm || 0, ss || 0);
}

export function addDays(iso, days) {
  return fromUTC(toUTC(iso) + days * 86400000);
}

/** Suma meses respetando el fin de mes: 31-ene + 1 mes = 28/29-feb. */
export function addMonths(iso, months, preferredDay) {
  const [y, m, d] = iso.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const day = Math.min(preferredDay || d, daysInMonth(ny, nm));
  return `${ny}-${pad(nm)}-${pad(day)}`;
}

export function addYears(iso, years) {
  return addMonths(iso, years * 12);
}

/** Días entre dos fechas (b - a). */
export function diffDays(a, b) {
  return Math.round((toUTC(b) - toUTC(a)) / 86400000);
}

export function dayOfWeek(iso) {
  return new Date(toUTC(iso)).getUTCDay();
}

export function compareDates(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function minDate(a, b) {
  return a < b ? a : b;
}

export function maxDate(a, b) {
  return a > b ? a : b;
}

export function startOfMonth(iso) {
  return iso.slice(0, 8) + '01';
}

/**
 * Próxima fecha (>= from) que cae en el día `day` del mes. Si el mes no tiene
 * ese día (p. ej. 31), se usa el último día del mes.
 */
export function nextMonthlyDate(from, day) {
  const [y, m] = from.split('-').map(Number);
  const candidate = `${y}-${pad(m)}-${pad(Math.min(day, daysInMonth(y, m)))}`;
  if (candidate >= from) return candidate;
  return addMonths(`${y}-${pad(m)}-01`, 1, day);
}

export function formatDate(iso, { withYear = true, withWeekday = false } = {}) {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  let text = `${d} ${MONTHS_SHORT[m - 1]}`;
  if (withYear) text += ` ${y}`;
  if (withWeekday) text = `${WEEKDAYS_SHORT[dayOfWeek(iso.slice(0, 10))]} ${text}`;
  return text;
}

export function formatDateTime(dateTime) {
  const t = timePart(dateTime);
  return `${formatDate(dateTime, { withYear: false, withWeekday: true })}${t ? ' · ' + t : ''}`;
}

export function formatMonthYear(iso) {
  const [y, m] = iso.split('-').map(Number);
  return `${MONTHS_LONG[m - 1]} ${y}`;
}

export function monthShort(iso) {
  return MONTHS_SHORT[Number(iso.slice(5, 7)) - 1];
}

/** Texto relativo breve: "hoy", "mañana", "en 5 días", "hace 2 días". */
export function relativeDays(iso, today) {
  const n = diffDays(today, iso);
  if (n === 0) return 'hoy';
  if (n === 1) return 'mañana';
  if (n === -1) return 'ayer';
  return n > 0 ? `en ${n} días` : `hace ${-n} días`;
}

/**
 * Interpreta fechas habituales en CSV: 2026-10-17, 17/10/2026, 17-10-26,
 * 17/oct/2026. `order` permite forzar 'dmy' (por defecto, México) o 'mdy'.
 */
export function parseFlexibleDate(input, order = 'dmy') {
  if (typeof input !== 'string') return null;
  const s = input.trim().toLowerCase();
  const time = (hh, mm, ss) => {
    if (hh === undefined) return '12:00:00';
    const h = +hh;
    const mi = +mm;
    const se = ss === undefined ? 0 : +ss;
    if (h > 23 || mi > 59 || se > 59) return null;
    return `${pad(h)}:${pad(mi)}:${pad(se)}`;
  };
  const withTime = (iso, hh, mm, ss) => {
    if (!isISODate(iso)) return null;
    const t = time(hh, mm, ss);
    return t ? `${iso} ${t}` : null;
  };
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ t](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    return withTime(`${m[1]}-${pad(+m[2])}-${pad(+m[3])}`, m[4], m[5], m[6]);
  }
  m = s.match(/^(\d{1,2})[-/.]([a-zé]{3,})\.?[-/.](\d{2,4})$/);
  if (m) {
    const idx = MONTHS_SHORT.findIndex(x => m[2].startsWith(x));
    if (idx < 0) return null;
    const year = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return withTime(`${year}-${pad(idx + 1)}-${pad(+m[1])}`);
  }
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:[ t](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const year = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    const [day, month] = order === 'mdy' ? [+m[2], +m[1]] : [+m[1], +m[2]];
    return withTime(`${year}-${pad(month)}-${pad(day)}`, m[4], m[5], m[6]);
  }
  return null;
}

let lastStamp = '';
/**
 * Marca de tiempo local con milisegundos y estrictamente creciente dentro del
 * proceso. Se usa en created_at/updated_at para ordenar registros sin empates.
 */
export function stamp(now = new Date()) {
  let ms = now.getTime();
  let value = `${nowDateTime(new Date(ms))}.${String(new Date(ms).getMilliseconds()).padStart(3, '0')}`;
  while (value <= lastStamp) {
    ms += 1;
    const d = new Date(ms);
    value = `${nowDateTime(d)}.${String(d.getMilliseconds()).padStart(3, '0')}`;
  }
  lastStamp = value;
  return value;
}
