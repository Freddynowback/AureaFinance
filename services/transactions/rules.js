/**
 * Reglas contables centralizadas. Todas las pantallas, estadísticas y
 * presupuestos derivan sus cifras de estas reglas; no se duplican en la UI.
 *
 * Tipos de operación:
 *  - expense       Gasto. Resta de la cuenta de origen (en crédito, aumenta la deuda).
 *                  Cuenta como gasto de su categoría.
 *  - income        Ingreso. Suma a la cuenta receptora. Cuenta como ingreso.
 *  - transfer      Movimiento entre cuentas propias. Resta de una, suma a otra.
 *                  No es ingreso ni gasto.
 *  - card_payment  Pago de tarjeta/crédito: resta de la cuenta de origen y reduce
 *                  la deuda de la cuenta de crédito destino. NO es gasto: el gasto
 *                  ya se contó cuando se hizo la compra.
 *  - refund        Devolución/reembolso. Suma a la cuenta y reduce el gasto neto de
 *                  su categoría. No infla los ingresos.
 *  - adjustment    Conciliación de saldo con signo. Corrige la cuenta sin ser
 *                  ingreso ni gasto.
 */

export const KINDS = ['expense', 'income', 'transfer', 'card_payment', 'refund', 'adjustment'];

export const KIND_LABELS = {
  expense: 'Gasto',
  income: 'Ingreso',
  transfer: 'Transferencia',
  card_payment: 'Pago de tarjeta',
  refund: 'Devolución',
  adjustment: 'Ajuste de saldo',
};

export const PAYMENT_METHODS = ['cash', 'debit', 'credit', 'transfer', 'other'];

export const PAYMENT_METHOD_LABELS = {
  cash: 'Efectivo',
  debit: 'Débito',
  credit: 'Crédito',
  transfer: 'Transferencia',
  other: 'Otro',
};

export const INCOME_TYPE_LABELS = {
  salary: 'Salario',
  extra: 'Ingreso extraordinario',
  refund: 'Devolución',
  other: 'Otros',
};

export const ACCOUNT_TYPE_LABELS = {
  cash: 'Efectivo',
  debit: 'Débito',
  savings: 'Ahorro',
  credit: 'Crédito',
  other: 'Otra',
};

/** Tipos de cuenta compatibles con cada método de pago. */
export const ACCOUNT_TYPES_FOR_METHOD = {
  cash: ['cash'],
  debit: ['debit', 'savings', 'other'],
  credit: ['credit'],
  transfer: ['debit', 'savings', 'other'],
  other: ['cash', 'debit', 'savings', 'credit', 'other'],
};

/** Método de pago sugerido según el tipo de cuenta. */
export function defaultMethodForAccount(type) {
  if (type === 'cash') return 'cash';
  if (type === 'credit') return 'credit';
  return 'debit';
}

/** Efecto con signo de un movimiento sobre el saldo de `accountId`. */
export function balanceDelta(tx, accountId) {
  let delta = 0;
  if (tx.account_id === accountId) {
    switch (tx.kind) {
      case 'income':
      case 'refund':
      case 'adjustment':
        delta += tx.amount;
        break;
      case 'expense':
      case 'transfer':
      case 'card_payment':
        delta -= tx.amount;
        break;
      default:
        break;
    }
  }
  if (tx.to_account_id === accountId && (tx.kind === 'transfer' || tx.kind === 'card_payment')) {
    delta += tx.amount;
  }
  return delta;
}

/** Contribución de un movimiento al gasto neto de su categoría. */
export function spendingDelta(tx) {
  if (tx.kind === 'expense') return tx.amount;
  if (tx.kind === 'refund') return -tx.amount;
  return 0;
}

/** Contribución de un movimiento a los ingresos del periodo. */
export function incomeDelta(tx) {
  return tx.kind === 'income' ? tx.amount : 0;
}

/**
 * Fragmento SQL que calcula el saldo de la cuenta `a` (alias) a partir de su
 * saldo inicial y los movimientos posteriores a la fecha del saldo inicial.
 * Debe mantenerse equivalente a balanceDelta().
 */
export const BALANCE_SQL = `(
  a.initial_balance
  + COALESCE((SELECT SUM(CASE WHEN t.kind IN ('income','refund','adjustment') THEN t.amount ELSE -t.amount END)
              FROM transactions t
              WHERE t.account_id = a.id AND t.occurred_at >= a.initial_balance_date), 0)
  + COALESCE((SELECT SUM(t.amount) FROM transactions t
              WHERE t.to_account_id = a.id AND t.occurred_at >= a.initial_balance_date), 0)
)`;

/** Deuda de una cuenta de crédito a partir de su saldo con signo. */
export function creditDebt(balance) {
  return balance < 0 ? -balance : 0;
}

/** Crédito disponible (null si no hay límite configurado). */
export function availableCredit(account, balance) {
  if (account.type !== 'credit' || !account.credit_limit) return null;
  return account.credit_limit + balance;
}

/** Cuentas que forman parte del dinero líquido (no crédito, activas, incluidas). */
export function isLiquidAccount(account) {
  return account.type !== 'credit' && account.status === 'active' && !!account.include_in_liquid;
}
