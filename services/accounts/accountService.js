/**
 * Cuentas independientes: efectivo, débito, ahorro, crédito y otras.
 * Los saldos se derivan de los movimientos (ver rules.BALANCE_SQL).
 */
import { accountsRepository } from '../../database/repositories/accountsRepository';
import { reservationsRepository } from '../../database/repositories/reservationsRepository';
import { loadDebtsWithPayments } from '../debts/schedule';
import { creditSummary, creditTotals } from './creditService';
import { CURRENCIES, DEFAULT_CURRENCY } from '../../config/currencies';
import { addDays, isISODate, nextMonthlyDate, nowDateTime, stamp, todayISO } from '../../utils/dates';
import { check, throwIfErrors, ValidationError } from '../../utils/errors';
import { uuid } from '../../utils/id';
import { availableCredit, creditDebt, isLiquidAccount } from '../transactions/rules';
import { insertTransaction } from '../transactions/transactionService';

const TYPES = ['cash', 'debit', 'savings', 'credit', 'other'];
const clean = v => (typeof v === 'string' ? v.trim() || null : v ?? null);
const optDay = v => (v === null || v === undefined || v === '' ? null : Number(v));

/**
 * `openingAmount` es lo que el usuario escribe: saldo disponible en cuentas
 * normales o deuda actual (positiva) en crédito.
 */
function normalize(input, previous) {
  const f = {};
  const type = previous ? previous.type : input.type;
  check(f, TYPES.includes(type), 'type', 'Tipo de cuenta no válido');
  const name = clean(input.name);
  check(f, !!name, 'name', 'Escribe un nombre');
  const currency = input.currency || previous?.currency || 'MXN';
  check(f, !!CURRENCIES[currency], 'currency', 'Moneda no soportada');
  const opening = input.openingAmount ?? 0;
  check(f, Number.isSafeInteger(opening), 'openingAmount', 'Importe no válido');
  if (type === 'credit') check(f, opening >= 0, 'openingAmount', 'La deuda inicial no puede ser negativa');
  const date = input.initial_balance_date || previous?.initial_balance_date || todayISO();
  check(f, isISODate(date), 'initial_balance_date', 'Fecha no válida');
  const limit = input.credit_limit ?? null;
  if (limit !== null) check(f, Number.isSafeInteger(limit) && limit > 0, 'credit_limit', 'Límite no válido');
  const statementDay = type === 'credit' ? optDay(input.statement_day) : null;
  const dueDay = type === 'credit' ? optDay(input.payment_due_day) : null;
  for (const [k, v] of [['statement_day', statementDay], ['payment_due_day', dueDay]]) {
    if (v !== null) check(f, Number.isInteger(v) && v >= 1 && v <= 31, k, 'Día entre 1 y 31');
  }
  throwIfErrors(f);
  return {
    name,
    type,
    institution: clean(input.institution),
    currency,
    initial_balance: type === 'credit' ? -opening : opening,
    initial_balance_date: date,
    credit_limit: type === 'credit' ? limit : null,
    statement_day: statementDay,
    payment_due_day: dueDay,
    color: input.color || previous?.color || null,
    status: input.status || previous?.status || 'active',
    include_in_liquid: type === 'credit' ? 0 : input.include_in_liquid === undefined ? (previous ? previous.include_in_liquid : 1) : input.include_in_liquid ? 1 : 0,
    notes: clean(input.notes),
  };
}

export async function createAccount(db, input) {
  const data = normalize(input, null);
  const now = stamp();
  const record = { id: uuid(), ...data, created_at: now, updated_at: now };
  await accountsRepository.insert(db, record);
  return record;
}

export function updateAccount(db, id, input) {
  return db.transaction(async tx => {
    const previous = await accountsRepository.get(tx, id);
    if (!previous) throw new ValidationError({ id: 'La cuenta no existe' });
    const opening =
      input.openingAmount ?? (previous.type === 'credit' ? -previous.initial_balance : previous.initial_balance);
    const data = normalize({ ...previous, ...input, openingAmount: opening }, previous);
    const moves = await accountsRepository.countMovements(tx, id);
    if (moves > 0 && data.currency !== previous.currency) {
      throw new ValidationError({ currency: 'No se puede cambiar la moneda de una cuenta con movimientos' });
    }
    if (moves > 0 && data.initial_balance_date !== previous.initial_balance_date) {
      throw new ValidationError({
        initial_balance_date: 'Con movimientos registrados no se puede mover la fecha del saldo inicial: usa "Conciliar saldo"',
      });
    }
    await accountsRepository.update(tx, { ...previous, ...data, id, updated_at: stamp() });
    return accountsRepository.get(tx, id);
  });
}

export function archiveAccount(db, id, archived = true) {
  return updateAccount(db, id, { status: archived ? 'archived' : 'active' });
}

/** Solo se elimina si no tiene historial; si lo tiene, se debe archivar. */
export async function deleteAccount(db, id) {
  const n = await accountsRepository.countMovements(db, id);
  if (n > 0) {
    throw new ValidationError({ id: `La cuenta tiene ${n} movimientos. Archívala para conservar el historial.` });
  }
  const deps = await db.get(
    `SELECT (SELECT COUNT(*) FROM debts WHERE account_id = ?) AS debts,
            (SELECT COUNT(*) FROM goals WHERE account_id = ?) AS goals,
            (SELECT COUNT(*) FROM reservations WHERE account_id = ?) AS reservations,
            (SELECT COUNT(*) FROM recurring_rules WHERE account_id = ?) AS rules`,
    [id, id, id, id],
  );
  if (deps.debts || deps.goals || deps.reservations || deps.rules) {
    throw new ValidationError({
      id: 'La cuenta tiene deudas, metas, apartados o recurrencias asociadas. Archívala o reasígnalos antes de eliminarla.',
    });
  }
  await accountsRepository.delete(db, id);
}

/**
 * Concilia el saldo real de una cuenta creando un movimiento de ajuste por la
 * diferencia (no es gasto ni ingreso). En crédito, `actual` es la deuda real.
 */
export function reconcileAccount(db, id, actual, { note, occurredAt } = {}) {
  return db.transaction(async tx => {
    const account = await accountsRepository.get(tx, id);
    if (!account) throw new ValidationError({ id: 'La cuenta no existe' });
    if (!Number.isSafeInteger(actual)) throw new ValidationError({ amount: 'Importe no válido' });
    if (account.type === 'credit' && actual < 0) {
      throw new ValidationError({ amount: 'Indica la deuda real como cantidad positiva (0 si no debes nada)' });
    }
    const targetBalance = account.type === 'credit' ? -actual : actual;
    const delta = targetBalance - account.balance;
    if (delta === 0) return null;
    return insertTransaction(tx, {
      kind: 'adjustment',
      amount: delta,
      account_id: id,
      occurred_at: occurredAt || nowDateTime(),
      description: note || 'Conciliación de saldo',
    });
  });
}

/** Próximas fechas de corte y de pago de una tarjeta. */
export function cardDates(account, today = todayISO()) {
  if (account.type !== 'credit') return {};
  const nextStatement = account.statement_day ? nextMonthlyDate(today, account.statement_day) : null;
  const nextDue = account.payment_due_day ? nextMonthlyDate(today, account.payment_due_day) : null;
  return { nextStatement, nextDue };
}

/**
 * Resumen de cuentas: saldos individuales y agregados claramente separados.
 *  - liquid: dinero real en cuentas líquidas (efectivo, débito, ahorro incluidas).
 *  - reserved: dinero apartado para deudas/metas dentro de las cuentas líquidas.
 *  - available: liquid - reserved (lo que se puede gastar sin tocar apartados).
 *  - creditDebt: deuda total de cuentas de crédito.
 */
export async function getAccountsOverview(db, today = todayISO()) {
  const [accounts, reserved, debts] = await Promise.all([
    accountsRepository.list(db),
    reservationsRepository.totalAgainstLiquid(db),
    loadDebtsWithPayments(db, undefined, today),
  ]);
  let liquid = 0;
  let debt = 0;
  // Los totales solo suman la moneda principal: sin conversión, mezclar monedas daría cifras falsas.
  const otherCurrencies = {};
  const items = accounts.map(a => {
    const item = { ...a };
    const main = a.currency === DEFAULT_CURRENCY;
    if (!main) {
      const o = (otherCurrencies[a.currency] = otherCurrencies[a.currency] || { liquid: 0, creditDebt: 0 });
      if (isLiquidAccount(a)) o.liquid += a.balance;
      if (a.type === 'credit') o.creditDebt += creditDebt(a.balance);
    }
    if (main && isLiquidAccount(a)) liquid += a.balance;
    if (a.type === 'credit') {
      item.debt = creditDebt(a.balance);
      item.availableCredit = availableCredit(a, a.balance);
      item.creditBalanceInFavor = a.balance > 0 ? a.balance : 0;
      item.credit = creditSummary(a, debts);
      Object.assign(item, cardDates(a, today));
      if (main) debt += item.debt;
    }
    return item;
  });
  const upcomingCard = items
    .filter(a => a.nextDue && a.debt > 0)
    .sort((x, y) => (x.nextDue < y.nextDue ? -1 : 1))[0] || null;
  return {
    accounts: items,
    liquid,
    reserved,
    available: liquid - reserved,
    creditDebt: debt,
    credit: creditTotals(items.filter(a => a.type === 'credit' && a.currency === DEFAULT_CURRENCY).map(a => a.credit)),
    currency: DEFAULT_CURRENCY,
    otherCurrencies,
    upcomingCard,
    hasAccounts: items.length > 0,
    horizon: addDays(today, 31),
  };
}
