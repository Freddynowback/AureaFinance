/**
 * Deudas y financiaciones registradas manualmente.
 *  - Crear deuda: guarda un saldo inicial (snapshot), no crea gastos.
 *  - Actualizar saldo: conciliación (snapshot), no crea gastos.
 *  - Registrar pago: movimiento card_payment hacia la tarjeta de la deuda.
 *  - Apartar dinero: reserva virtual; no mueve dinero ni reduce la deuda.
 */
import { accountsRepository } from '../../database/repositories/accountsRepository';
import { debtsRepository } from '../../database/repositories/debtsRepository';
import { reservationsRepository } from '../../database/repositories/reservationsRepository';
import { addMonths, isISODate, nowDateTime, stamp, todayISO } from '../../utils/dates';
import { check, throwIfErrors, ValidationError } from '../../utils/errors';
import { uuid } from '../../utils/id';
import { insertTransaction } from '../transactions/transactionService';

export const FINANCING_LABELS = {
  msi: 'Meses sin intereses',
  installments: 'Cuotas con intereses',
  revolving: 'Saldo revolvente',
  loan: 'Préstamo',
  other: 'Otra',
};

const clean = v => (typeof v === 'string' ? v.trim() || null : v ?? null);
const optInt = v => (v === '' || v === undefined || v === null ? null : Number(v));

async function normalize(db, input) {
  const f = {};
  const name = clean(input.name);
  check(f, !!name, 'name', 'Escribe un nombre');
  const account = input.account_id ? await accountsRepository.get(db, input.account_id) : null;
  check(f, !!account && account.type === 'credit', 'account_id', 'Selecciona la tarjeta o cuenta de crédito');
  check(f, Object.keys(FINANCING_LABELS).includes(input.financing_type || 'other'), 'financing_type', 'Tipo no válido');
  const monthly = optInt(input.monthly_payment);
  if (monthly !== null) check(f, Number.isSafeInteger(monthly) && monthly > 0, 'monthly_payment', 'Importe no válido');
  if (input.next_due_date) check(f, isISODate(input.next_due_date), 'next_due_date', 'Fecha no válida');
  const statementDay = optInt(input.statement_day);
  if (statementDay !== null) check(f, statementDay >= 1 && statementDay <= 31, 'statement_day', 'Día entre 1 y 31');
  const installments = optInt(input.installments_remaining);
  if (installments !== null) check(f, Number.isInteger(installments) && installments >= 0, 'installments_remaining', 'Número no válido');
  const rate = optInt(input.interest_rate_bp);
  if (rate !== null) check(f, Number.isInteger(rate) && rate >= 0, 'interest_rate_bp', 'Tasa no válida');
  throwIfErrors(f);
  return {
    name,
    account_id: account.id,
    financing_type: input.financing_type || 'other',
    monthly_payment: monthly,
    next_due_date: input.next_due_date || null,
    statement_day: statementDay,
    installments_remaining: installments,
    interest_rate_bp: rate,
    notes: clean(input.notes),
    currency: account.currency,
  };
}

export async function insertDebt(tx, input) {
  const data = await normalize(tx, input);
  const balance = input.balance;
  if (!Number.isSafeInteger(balance) || balance < 0) {
    throw new ValidationError({ balance: 'Introduce el saldo pendiente' });
  }
  const now = stamp();
  const debt = {
    id: uuid(),
    ...data,
    status: 'active',
    origin_transaction_id: input.origin_transaction_id || null,
    created_at: now,
    updated_at: now,
  };
  await debtsRepository.insert(tx, debt);
  await debtsRepository.insertSnapshot(tx, {
    id: uuid(),
    debt_id: debt.id,
    balance,
    recorded_at: input.balance_date ? `${input.balance_date} 00:00:00` : nowDateTime(),
    kind: 'initial',
    note: 'Saldo inicial',
    created_at: stamp(),
  });
  // Financiación existente que la tarjeta aún no refleja: se suma a la deuda
  // de la tarjeta con un ajuste (no es un gasto: la compra fue en el pasado).
  if (input.addToCardDebt && balance > 0) {
    await insertTransaction(tx, {
      kind: 'adjustment',
      amount: -balance,
      account_id: debt.account_id,
      occurred_at: nowDateTime(),
      description: `Saldo de financiación: ${debt.name}`,
    });
  }
  return debt;
}

export function createDebt(db, input) {
  return db.transaction(tx => insertDebt(tx, input));
}

/**
 * Compra financiada: registra el gasto UNA sola vez en la tarjeta y crea el
 * plan de financiación ligado a ese gasto, todo en una transacción.
 */
export function createFinancedPurchase(db, expenseInput, debtInput) {
  return db.transaction(async tx => {
    const expense = await insertTransaction(tx, { ...expenseInput, kind: 'expense', payment_method: 'credit' });
    const debt = await insertDebt(tx, {
      ...debtInput,
      account_id: expense.account_id,
      balance: debtInput.balance ?? expense.amount,
      origin_transaction_id: expense.id,
    });
    return { expense, debt };
  });
}

export async function updateDebt(db, id, input) {
  const previous = await debtsRepository.get(db, id);
  if (!previous) throw new ValidationError({ id: 'La deuda no existe' });
  const data = await normalize(db, { ...previous, ...input });
  const status = input.status || previous.status;
  await debtsRepository.update(db, { ...previous, ...data, status, id, updated_at: stamp() });
  return debtsRepository.get(db, id);
}

/** Actualización manual mensual del saldo pendiente: conciliación, nunca un gasto. */
export function reconcileDebt(db, id, newBalance, { note, recordedAt } = {}) {
  return db.transaction(async tx => {
    const debt = await debtsRepository.get(tx, id);
    if (!debt) throw new ValidationError({ id: 'La deuda no existe' });
    if (!Number.isSafeInteger(newBalance) || newBalance < 0) {
      throw new ValidationError({ balance: 'Saldo no válido' });
    }
    const snapshot = {
      id: uuid(),
      debt_id: id,
      balance: newBalance,
      recorded_at: recordedAt || nowDateTime(),
      kind: 'reconciliation',
      note: clean(note) || 'Actualización manual de saldo',
      created_at: stamp(),
    };
    await debtsRepository.insertSnapshot(tx, snapshot);
    return snapshot;
  });
}

/**
 * Registra un pago real: sale dinero de `fromAccountId` y se abona a la
 * tarjeta de la deuda. Por defecto libera lo apartado para esa deuda hasta el
 * importe pagado (el apartado se usó para pagar).
 */
export function registerDebtPayment(db, { debtId, fromAccountId, amount, occurredAt, description, releaseReserved = true }) {
  return db.transaction(async tx => {
    const debt = await debtsRepository.get(tx, debtId);
    if (!debt) throw new ValidationError({ debt_id: 'La deuda no existe' });
    if (!debt.account_id) throw new ValidationError({ debt_id: 'La deuda no tiene tarjeta asociada' });
    const payment = await insertTransaction(tx, {
      kind: 'card_payment',
      amount,
      account_id: fromAccountId,
      to_account_id: debt.account_id,
      debt_id: debtId,
      occurred_at: occurredAt || nowDateTime(),
      description: description || `Pago: ${debt.name}`,
    });
    if (releaseReserved && debt.reserved > 0) {
      const release = Math.min(debt.reserved, amount);
      await reservationsRepository.insert(tx, {
        id: uuid(),
        target_type: 'debt',
        target_id: debtId,
        amount: -release,
        account_id: null,
        transaction_id: payment.id,
        occurred_at: payment.occurred_at,
        note: 'Apartado usado en el pago',
        created_at: stamp(),
      });
    }
    return payment;
  });
}

/** Aparta (positivo) o libera (negativo) dinero para una deuda. No mueve dinero. */
export function reserveForDebt(db, debtId, amount, { accountId = null, note } = {}) {
  return db.transaction(async tx => {
    const debt = await debtsRepository.get(tx, debtId);
    if (!debt) throw new ValidationError({ debt_id: 'La deuda no existe' });
    if (!Number.isSafeInteger(amount) || amount === 0) throw new ValidationError({ amount: 'Importe no válido' });
    if (debt.reserved + amount < 0) throw new ValidationError({ amount: 'No puedes liberar más de lo apartado' });
    const record = {
      id: uuid(),
      target_type: 'debt',
      target_id: debtId,
      amount,
      account_id: accountId,
      transaction_id: null,
      occurred_at: nowDateTime(),
      note: clean(note) || (amount > 0 ? 'Dinero apartado' : 'Apartado liberado'),
      created_at: stamp(),
    };
    await reservationsRepository.insert(tx, record);
    return record;
  });
}

/** Siguiente vencimiento efectivo: si la fecha guardada ya pasó, avanza mes a mes. */
export function effectiveDueDate(debt, today = todayISO()) {
  if (!debt.next_due_date) return null;
  let d = debt.next_due_date;
  const day = Number(debt.next_due_date.slice(8, 10));
  for (let i = 0; d < today && i < 240; i++) d = addMonths(debt.next_due_date, i + 1, day);
  return d;
}

/** Historial para la gráfica: saldos conciliados y pagos en orden cronológico. */
export async function getDebtDetail(db, id) {
  const debt = await debtsRepository.get(db, id);
  if (!debt) return null;
  const [snapshots, payments, reservations] = await Promise.all([
    debtsRepository.snapshots(db, id),
    debtsRepository.payments(db, id),
    reservationsRepository.list(db, 'debt', id),
  ]);
  const events = [
    ...snapshots.map(s => ({ type: 'snapshot', at: s.created_at, date: s.recorded_at, amount: s.balance, note: s.note, id: s.id })),
    ...payments.map(p => ({ type: 'payment', at: p.created_at, date: p.occurred_at, amount: p.amount, note: p.description, id: p.id, account_name: p.account_name })),
  ].sort((a, b) => (a.at < b.at ? -1 : 1));
  let running = 0;
  const history = events.map(e => {
    running = e.type === 'snapshot' ? e.amount : running - e.amount;
    return { ...e, balanceAfter: running };
  });
  return { debt: { ...debt, effectiveDueDate: effectiveDueDate(debt) }, snapshots, payments, reservations, history };
}

export async function deleteDebt(db, id) {
  await db.transaction(async tx => {
    await reservationsRepository.deleteForTarget(tx, 'debt', id);
    await debtsRepository.delete(tx, id);
  });
}

export function listDebts(db, opts) {
  return debtsRepository.list(db, opts).then(list => list.map(d => ({ ...d, effectiveDueDate: effectiveDueDate(d) })));
}
