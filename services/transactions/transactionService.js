/**
 * Alta, edición y baja de movimientos con validación contable. Toda escritura
 * se ejecuta dentro de una transacción de base de datos.
 */
import { accountsRepository } from '../../database/repositories/accountsRepository';
import { categoriesRepository } from '../../database/repositories/categoriesRepository';
import { debtsRepository } from '../../database/repositories/debtsRepository';
import { recurringRepository } from '../../database/repositories/recurringRepository';
import { transactionsRepository } from '../../database/repositories/transactionsRepository';
import { isISODateTime, stamp } from '../../utils/dates';
import { check, throwIfErrors, ValidationError } from '../../utils/errors';
import { uuid } from '../../utils/id';
import { ACCOUNT_TYPES_FOR_METHOD, KINDS, PAYMENT_METHODS } from './rules';

const clean = v => (typeof v === 'string' ? v.trim() || null : v ?? null);

/** Tope por movimiento: 10,000 millones de pesos. Evita desbordes en sumas. */
export const MAX_AMOUNT = 1000000000000;

async function refundedSoFar(db, originalId, excludeId) {
  const row = await db.get(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM transactions
     WHERE kind = 'refund' AND related_transaction_id = ? AND id <> ?`,
    [originalId, excludeId || ''],
  );
  return row.total;
}

/**
 * Valida y normaliza un movimiento. `previous` es el registro original al
 * editar (permite conservar cuentas/categorías archivadas ya usadas).
 */
export async function validateTransaction(db, input, previous = null) {
  const f = {};
  const kind = input.kind;
  check(f, KINDS.includes(kind), 'kind', 'Tipo de operación no válido');
  throwIfErrors(f);

  const amount = input.amount;
  check(f, Number.isSafeInteger(amount), 'amount', 'Introduce un importe válido');
  if (Number.isSafeInteger(amount)) check(f, Math.abs(amount) <= MAX_AMOUNT, 'amount', 'El importe es demasiado grande');
  if (Number.isSafeInteger(amount)) {
    if (kind === 'adjustment') check(f, amount !== 0, 'amount', 'El ajuste no puede ser cero');
    else check(f, amount > 0, 'amount', 'El importe debe ser mayor que cero');
  }
  check(f, isISODateTime(input.occurred_at), 'occurred_at', 'Fecha no válida');

  const account = input.account_id ? await accountsRepository.get(db, input.account_id) : null;
  check(f, !!account, 'account_id', 'Selecciona una cuenta');
  const keepsAccount = previous && previous.account_id === input.account_id;
  if (account) check(f, account.status === 'active' || keepsAccount, 'account_id', 'La cuenta está archivada');

  const method = clean(input.payment_method);
  if (method) check(f, PAYMENT_METHODS.includes(method), 'payment_method', 'Método de pago no válido');

  let toAccount = null;
  if (kind === 'transfer' || kind === 'card_payment') {
    toAccount = input.to_account_id ? await accountsRepository.get(db, input.to_account_id) : null;
    check(f, !!toAccount, 'to_account_id', 'Selecciona la cuenta de destino');
    check(f, input.to_account_id !== input.account_id, 'to_account_id', 'Las cuentas deben ser distintas');
    const keepsTo = previous && previous.to_account_id === input.to_account_id;
    if (toAccount) check(f, toAccount.status === 'active' || keepsTo, 'to_account_id', 'La cuenta destino está archivada');
    if (toAccount && account) {
      check(f, toAccount.currency === account.currency, 'to_account_id', 'Las cuentas tienen monedas distintas; aún no se admiten conversiones');
    }
  }

  let category = null;
  if (kind === 'expense' || kind === 'refund' || (kind === 'income' && input.category_id)) {
    category = input.category_id ? await categoriesRepository.get(db, input.category_id) : null;
    check(f, !!category, 'category_id', 'Selecciona una categoría');
    if (category) {
      const keepsCat = previous && previous.category_id === input.category_id;
      check(f, category.status === 'active' || keepsCat, 'category_id', 'La categoría está archivada');
      const wanted = kind === 'income' ? 'income' : 'expense';
      check(f, category.kind === wanted || category.kind === 'both', 'category_id', 'La categoría no corresponde a este tipo de operación');
    }
  }

  if (account) {
    switch (kind) {
      case 'expense':
        if (method && method !== 'other') {
          check(
            f,
            ACCOUNT_TYPES_FOR_METHOD[method].includes(account.type),
            'account_id',
            method === 'credit'
              ? 'Para pagar con crédito selecciona una tarjeta o cuenta de crédito'
              : 'La cuenta no corresponde al método de pago',
          );
        }
        break;
      case 'income':
        check(f, account.type !== 'credit', 'account_id', 'Un ingreso debe llegar a una cuenta de efectivo, débito o ahorro');
        break;
      case 'transfer':
        if (toAccount) check(f, toAccount.type !== 'credit', 'to_account_id', 'Para abonar a una tarjeta usa "Pago de tarjeta"');
        break;
      case 'card_payment':
        check(f, account.type !== 'credit', 'account_id', 'El pago debe salir de una cuenta de efectivo, débito o ahorro');
        if (toAccount) check(f, toAccount.type === 'credit', 'to_account_id', 'Selecciona la tarjeta o crédito que pagas');
        break;
      default:
        break;
    }
  }

  let debtId = clean(input.debt_id);
  if (debtId) {
    check(f, kind === 'card_payment', 'debt_id', 'Solo un pago puede vincularse a una deuda');
    const debt = await debtsRepository.get(db, debtId);
    check(f, !!debt, 'debt_id', 'La deuda no existe');
    if (debt && toAccount) {
      check(f, debt.account_id === toAccount.id, 'debt_id', 'La deuda pertenece a otra tarjeta: el pago no puede reducirla');
    }
    if (debt && Number.isSafeInteger(amount)) {
      // Al editar, el pago anterior ya está descontado del pendiente.
      const sameDebtBefore = previous && previous.debt_id === debtId && previous.created_at > (debt.balance_snapshot_created_at || '') ? previous.amount : 0;
      const room = Math.max(0, debt.outstanding) + sameDebtBefore;
      check(f, amount <= room, 'amount', `El pago supera lo pendiente de esta financiación (${(room / 100).toFixed(2)}). Registra el resto como pago general de la tarjeta.`);
    }
  }

  let relatedId = clean(input.related_transaction_id);
  if (kind === 'refund' && relatedId && Number.isSafeInteger(amount)) {
    const original = await transactionsRepository.get(db, relatedId);
    check(f, !!original && original.kind === 'expense', 'related_transaction_id', 'La devolución debe vincularse a un gasto');
    if (original && original.kind === 'expense') {
      // La devolución corrige el gasto de su misma categoría y moneda.
      check(f, original.category_id === input.category_id, 'category_id', 'La devolución debe usar la categoría del gasto original');
      if (account) check(f, original.currency === account.currency, 'account_id', 'La devolución debe ser en la moneda del gasto original');
      const already = await refundedSoFar(db, relatedId, previous && previous.id);
      check(
        f,
        already + amount <= original.amount,
        'amount',
        'La devolución supera el importe pendiente de devolver del gasto original',
      );
    }
  } else if (kind !== 'refund') {
    relatedId = null;
  }
  throwIfErrors(f);

  return {
    kind,
    amount,
    currency: account.currency,
    account_id: account.id,
    to_account_id: toAccount ? toAccount.id : null,
    category_id: category ? category.id : null,
    payment_method: kind === 'expense' ? method || null : kind === 'card_payment' || kind === 'transfer' ? method || 'transfer' : method,
    income_type: kind === 'income' ? clean(input.income_type) || 'other' : null,
    source: clean(input.source),
    description: clean(input.description),
    tags: clean(input.tags),
    occurred_at: input.occurred_at,
    debt_id: kind === 'card_payment' ? debtId : null,
    related_transaction_id: relatedId,
    // Solo las recurrencias internas pueden vincular una ocurrencia.
    recurring_occurrence_id: previous
      ? previous.recurring_occurrence_id
      : String(input.origin || '').startsWith('recurring')
        ? input.recurring_occurrence_id ?? null
        : null,
    origin: input.origin || previous?.origin || 'manual',
    external_id: clean(input.external_id) ?? previous?.external_id ?? null,
    import_batch_id: input.import_batch_id ?? previous?.import_batch_id ?? null,
  };
}

/** Inserta un movimiento ya dentro de una transacción abierta (`tx`). */
export async function insertTransaction(tx, input) {
  const data = await validateTransaction(tx, input);
  const now = stamp();
  const record = { id: input.id || uuid(), ...data, created_at: now, updated_at: now };
  await transactionsRepository.insert(tx, record);
  return record;
}

export function createTransaction(db, input) {
  return db.transaction(tx => insertTransaction(tx, input));
}

export function updateTransaction(db, id, input) {
  return db.transaction(async tx => {
    const previous = await transactionsRepository.get(tx, id);
    if (!previous) throw new ValidationError({ id: 'El movimiento ya no existe' });
    if (input.kind && input.kind !== previous.kind) {
      throw new ValidationError({ kind: 'No se puede cambiar el tipo de un movimiento: elimínalo y registra uno nuevo' });
    }
    const data = await validateTransaction(tx, { ...previous, ...input, kind: previous.kind }, previous);
    if (previous.kind === 'expense' && data.kind !== 'expense') {
      const refunds = await refundedSoFar(tx, id);
      if (refunds > 0) throw new ValidationError({ kind: 'Este gasto tiene devoluciones vinculadas' });
    }
    if (previous.kind === 'expense' && data.kind === 'expense') {
      const refunds = await refundedSoFar(tx, id);
      if (data.amount < refunds) {
        throw new ValidationError({ amount: 'El importe no puede ser menor que lo ya devuelto' });
      }
    }
    const record = { ...previous, ...data, id, updated_at: stamp() };
    await transactionsRepository.update(tx, record);
    return record;
  });
}

/**
 * Elimina un movimiento. Si procede de una recurrencia, la ocurrencia vuelve a
 * quedar pendiente (o se marca omitida si fue automática, para que no se
 * vuelva a crear sola).
 */
export function deleteTransaction(db, id) {
  return db.transaction(async tx => {
    const previous = await transactionsRepository.get(tx, id);
    if (!previous) return false;
    if (previous.recurring_occurrence_id) {
      await recurringRepository.setOccurrenceStatus(
        tx,
        previous.recurring_occurrence_id,
        previous.origin === 'recurring_auto' ? 'skipped' : 'pending',
        null,
      );
    }
    await transactionsRepository.delete(tx, id);
    return true;
  });
}

/** Duplica un movimiento con fecha nueva (por defecto, ahora). Útil para gastos frecuentes. */
export async function duplicateTransaction(db, id, occurredAt) {
  const original = await transactionsRepository.get(db, id);
  if (!original) throw new ValidationError({ id: 'El movimiento ya no existe' });
  const {
    id: _id, created_at, updated_at, recurring_occurrence_id, external_id, import_batch_id, related_transaction_id,
    ...rest
  } = original;
  return createTransaction(db, { ...rest, origin: 'manual', occurred_at: occurredAt });
}

/** Gastos más repetidos (misma categoría, cuenta, importe y descripción) para "repetir". */
export function frequentExpenses(db, limit = 6) {
  return db.all(
    `SELECT t.category_id, t.account_id, t.amount, t.description, t.payment_method, COUNT(*) AS times,
            MAX(t.occurred_at) AS last_at, c.name AS category_name, c.color AS category_color, c.icon AS category_icon,
            a.name AS account_name
     FROM transactions t
     JOIN categories c ON c.id = t.category_id AND c.status = 'active'
     JOIN accounts a ON a.id = t.account_id AND a.status = 'active'
     WHERE t.kind = 'expense'
     GROUP BY t.category_id, t.account_id, t.amount, COALESCE(t.description, '')
     HAVING times >= 2
     ORDER BY times DESC, last_at DESC
     LIMIT ?`,
    [limit],
  );
}
