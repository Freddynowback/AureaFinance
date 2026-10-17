/**
 * Dinero en unidades menores enteras (centavos). Ninguna función de este
 * módulo devuelve importes con decimales: toda la app trabaja con enteros.
 */
import { CURRENCIES, DEFAULT_CURRENCY } from '../config/currencies';

export function isCents(value) {
  return Number.isSafeInteger(value);
}

export function assertCents(value, label = 'importe') {
  if (!isCents(value)) {
    throw new Error(`El ${label} debe ser un entero en centavos (recibido: ${value})`);
  }
  return value;
}

/**
 * Convierte texto escrito por el usuario o leído de un CSV a centavos.
 * Acepta formatos mexicanos ("$1,234.56", "1234.5", "-1,200", "(350.00)")
 * y, con decimalSeparator=',', formatos europeos ("1.234,56").
 * Devuelve null si el texto no es un importe válido.
 */
export function parseAmount(input, { decimalSeparator = 'auto' } = {}) {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return null;
    // Se redondea sobre la representación decimal más corta (String(1.005) = "1.005"),
    // no sobre el binario IEEE-754 (1.005 * 100 = 100.49999…).
    const text = String(Math.abs(input));
    const [int, frac = ''] = /e/i.test(text) ? Math.abs(input).toFixed(10).split('.') : text.split('.');
    const cents = Number(int) * 100 + Number((frac + '00').slice(0, 2)) + (Number(frac[2] || 0) >= 5 ? 1 : 0);
    return input < 0 ? -cents : cents;
  }
  if (typeof input !== 'string') return null;
  let s = input.trim().replace(/\s+/g, '');
  if (!s) return null;

  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/^(MXN|MN|USD|EUR)/i, '').replace(/(MXN|MN|USD|EUR)$/i, '');
  if (s.startsWith('-')) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith('+')) {
    s = s.slice(1);
  }
  s = s.replace(/^\$/, '');
  if (s.endsWith('-')) {
    negative = !negative;
    s = s.slice(0, -1);
  }
  if (!/^[0-9.,]+$/.test(s)) return null;

  let decimal = decimalSeparator;
  if (decimal === 'auto') {
    const lastDot = s.lastIndexOf('.');
    const lastComma = s.lastIndexOf(',');
    if (lastDot >= 0 && lastComma >= 0) {
      decimal = lastDot > lastComma ? '.' : ',';
    } else if (lastComma >= 0) {
      // "1,234" es miles en México; "12,5" o "12,50" se interpreta como decimal.
      const tail = s.length - lastComma - 1;
      const commas = s.split(',').length - 1;
      decimal = commas === 1 && tail > 0 && tail <= 2 ? ',' : '.';
    } else {
      decimal = '.';
    }
  }
  const thousands = decimal === '.' ? ',' : '.';
  const parts = s.split(thousands);
  // Valida la agrupación de miles cuando existe ("1,23,4" no es válido).
  if (parts.length > 1) {
    const [first, ...rest] = parts;
    const lastGroup = rest[rest.length - 1].split(decimal)[0];
    const groupsOk =
      first.length >= 1 &&
      first.length <= 3 &&
      rest.slice(0, -1).every(g => g.length === 3) &&
      lastGroup.length === 3;
    if (!groupsOk) return null;
  }
  const normalized = parts.join('');
  const pieces = normalized.split(decimal);
  if (pieces.length > 2) return null;
  const [intPart, fracPart = ''] = pieces;
  if (!intPart && !fracPart) return null;
  if (fracPart.length > 2) {
    return null;
  }
  const cents =
    parseInt(intPart || '0', 10) * 100 + parseInt((fracPart + '00').slice(0, 2), 10);
  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}

function groupThousands(digits) {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Formatea centavos con el formato regional mexicano: $1,234.56 */
export function formatMoney(cents, currency = DEFAULT_CURRENCY, { showCents = true, sign = false } = {}) {
  if (!isCents(cents)) return '—';
  const info = CURRENCIES[currency] || CURRENCIES[DEFAULT_CURRENCY];
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  let text = info.symbol + groupThousands(String(whole));
  if (showCents) text += '.' + String(frac).padStart(2, '0');
  if (negative) return '-' + text;
  if (sign && cents > 0) return '+' + text;
  return text;
}

/** Formato compacto para cifras grandes en tarjetas: $12.4k */
export function formatCompact(cents, currency = DEFAULT_CURRENCY) {
  const abs = Math.abs(cents);
  if (abs < 1000000) return formatMoney(cents, currency, { showCents: abs % 100 !== 0 });
  const info = CURRENCIES[currency] || CURRENCIES[DEFAULT_CURRENCY];
  const pesos = abs / 100;
  const text = pesos >= 1e6 ? (pesos / 1e6).toFixed(1) + 'M' : (pesos / 1e3).toFixed(1) + 'k';
  return (cents < 0 ? '-' : '') + info.symbol + text.replace('.0', '');
}

/** Centavos -> texto editable ("1234.5" -> "1234.50"), sin separador de miles. */
export function centsToInput(cents) {
  if (!isCents(cents)) return '';
  const abs = Math.abs(cents);
  return (cents < 0 ? '-' : '') + Math.floor(abs / 100) + '.' + String(abs % 100).padStart(2, '0');
}

export function sum(values) {
  return values.reduce((acc, v) => acc + v, 0);
}

/**
 * Reparte `total` centavos en `parts` partes cuya suma es exactamente `total`.
 * `unit` define la granularidad preferida (100 = pesos enteros): las partes
 * son múltiplos de `unit` salvo la primera, que absorbe el residuo menor que
 * `unit`. El excedente se asigna a las primeras partes.
 */
export function splitEvenly(total, parts, unit = 1) {
  assertCents(total, 'total');
  if (!Number.isInteger(parts) || parts <= 0) throw new Error('El número de partes debe ser positivo');
  if (!Number.isInteger(unit) || unit <= 0) throw new Error('La unidad debe ser positiva');
  if (total < 0) return splitEvenly(-total, parts, unit).map(v => -v);
  const units = Math.floor(total / unit);
  const leftover = total - units * unit;
  const base = Math.floor(units / parts);
  const extra = units - base * parts;
  const result = [];
  for (let i = 0; i < parts; i++) {
    result.push((base + (i < extra ? 1 : 0)) * unit);
  }
  result[0] += leftover;
  return result;
}

/**
 * Porcentajes enteros (o con `decimals`) que suman exactamente 100 usando el
 * método del mayor residuo. Devuelve ceros si el total es 0.
 */
export function percentages(values, decimals = 0) {
  const total = sum(values);
  if (total <= 0) return values.map(() => 0);
  const scale = 100 * 10 ** decimals;
  const raw = values.map(v => (v * scale) / total);
  const floors = raw.map(Math.floor);
  let remaining = scale - sum(floors);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; k < order.length && remaining > 0; k++, remaining--) {
    floors[order[k].i] += 1;
  }
  return floors.map(v => v / 10 ** decimals);
}

/** Porcentaje (0-100+) de `part` sobre `whole`, con un decimal. */
export function ratioPercent(part, whole) {
  if (!whole) return 0;
  return Math.round((part * 1000) / whole) / 10;
}
