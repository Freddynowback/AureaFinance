import { openTestDb, categoryId, makeAccount } from '../helpers/testDb';
import { ValidationError } from '../../utils/errors';
import { deleteAccount, updateAccount, archiveAccount } from '../../services/accounts/accountService';
import { createDebt, registerDebtPayment } from '../../services/debts/debtService';
import { debtsRepository } from '../../database/repositories/debtsRepository';
import { createGoal, updateGoal, moveGoalMoney } from '../../services/goals/goalService';
import { createRule, updateRule, confirmOccurrence, skipOccurrence, syncRecurring } from '../../services/recurring/recurringService';
import { createTransaction, updateTransaction, MAX_AMOUNT } from '../../services/transactions/transactionService';
import { parseAmount } from '../../utils/money';

const at = '2026-10-15 12:00:00';

describe('correcciones de auditoría', () => {
  let db;

  beforeEach(async () => {
    db = await openTestDb();
  });

  afterEach(async () => {
    await db.close();
  });

  test('rechaza pagos mayores al pendiente, permite el pago exacto y ediciones dentro del margen', async () => {
    const debit = await makeAccount(db, { name: 'Débito' });
    const card = await makeAccount(db, { name: 'Crédito', type: 'credit', credit_limit: 100000 });
    const debt = await createDebt(db, {
      name: 'Plan', account_id: card.id, balance: 1000, monthly_payment: 1000,
    });

    await expect(registerDebtPayment(db, {
      debtId: debt.id, fromAccountId: debit.id, amount: 1001, occurredAt: at,
    })).rejects.toBeInstanceOf(ValidationError);
    const payment = await registerDebtPayment(db, {
      debtId: debt.id, fromAccountId: debit.id, amount: 600, occurredAt: at,
    });
    await updateTransaction(db, payment.id, { amount: 1000 });
    expect((await debtsRepository.get(db, debt.id)).outstanding).toBe(0);
    await expect(updateTransaction(db, payment.id, { amount: 1001 })).rejects.toBeInstanceOf(ValidationError);
  });

  test('rechaza mover dinero de o hacia una cuenta de crédito en una meta', async () => {
    const debit = await makeAccount(db, { name: 'Débito' });
    const card = await makeAccount(db, { name: 'Crédito', type: 'credit', credit_limit: 100000 });
    const goal = await createGoal(db, { name: 'Meta', target_amount: 10000, mode: 'account', account_id: debit.id });

    await expect(moveGoalMoney(db, goal.id, 1000, { fromAccountId: card.id })).rejects.toBeInstanceOf(ValidationError);
    await expect(moveGoalMoney(db, goal.id, -1000, { toAccountId: card.id })).rejects.toBeInstanceOf(ValidationError);
  });

  test('rechaza borrar cuentas con deuda, meta, apartado o recurrencia aunque no tengan movimientos', async () => {
    const category = await categoryId(db, 'Alimentación');
    const cases = [];
    const debtAccount = await makeAccount(db, { name: 'Deuda', type: 'credit', credit_limit: 100000 });
    await createDebt(db, { name: 'Deuda', account_id: debtAccount.id, balance: 1000 });
    cases.push(debtAccount);
    const goalAccount = await makeAccount(db, { name: 'Meta' });
    await createGoal(db, { name: 'Meta', target_amount: 1000, mode: 'account', account_id: goalAccount.id });
    cases.push(goalAccount);
    const reservedAccount = await makeAccount(db, { name: 'Apartado' });
    await db.run(
      `INSERT INTO reservations
       (id, target_type, target_id, amount, account_id, transaction_id, occurred_at, note, created_at)
       VALUES (?, 'goal', ?, 100, ?, NULL, ?, 'Apartado', ?)`,
      ['reservation-only', 'nonexistent-goal', reservedAccount.id, at, at],
    );
    cases.push(reservedAccount);
    const recurringAccount = await makeAccount(db, { name: 'Recurrente' });
    await createRule(db, {
      kind: 'expense', name: 'Regla', amount: 100, account_id: recurringAccount.id,
      category_id: category, frequency: 'monthly', start_date: '2026-10-15',
    });
    cases.push(recurringAccount);

    for (const account of cases) {
      await expect(deleteAccount(db, account.id)).rejects.toBeInstanceOf(ValidationError);
    }
  });

  test('confirmOccurrence y skipOccurrence solo aceptan ocurrencias pendientes', async () => {
    const account = await makeAccount(db);
    const income = await createRule(db, {
      kind: 'income', name: 'Ingreso', amount: 100, account_id: account.id,
      frequency: 'monthly', start_date: '2026-10-15',
    });
    const confirmed = await db.get('SELECT id FROM recurring_occurrences WHERE rule_id = ?', [income.id]);
    await confirmOccurrence(db, confirmed.id, { occurred_at: at });
    await expect(confirmOccurrence(db, confirmed.id)).rejects.toBeInstanceOf(ValidationError);

    const expense = await createRule(db, {
      kind: 'expense', name: 'Gasto', amount: 100, account_id: account.id,
      category_id: await categoryId(db, 'Alimentación'), frequency: 'monthly', start_date: '2026-11-15',
    });
    const skipped = await db.get('SELECT id FROM recurring_occurrences WHERE rule_id = ?', [expense.id]);
    await skipOccurrence(db, skipped.id);
    await expect(skipOccurrence(db, skipped.id)).rejects.toBeInstanceOf(ValidationError);
  });

  test('createRule y updateRule validan categoría e incompatibilidad de crédito en ingresos', async () => {
    const debit = await makeAccount(db, { name: 'Débito' });
    const card = await makeAccount(db, { name: 'Crédito', type: 'credit', credit_limit: 100000 });
    const food = await categoryId(db, 'Alimentación');
    const salary = await categoryId(db, 'Salario');
    await expect(createRule(db, {
      kind: 'expense', name: 'Mal gasto', amount: 100, account_id: debit.id, category_id: salary,
      frequency: 'monthly', start_date: '2026-10-15',
    })).rejects.toBeInstanceOf(ValidationError);
    await expect(createRule(db, {
      kind: 'income', name: 'Mal ingreso', amount: 100, account_id: card.id,
      frequency: 'monthly', start_date: '2026-10-15',
    })).rejects.toBeInstanceOf(ValidationError);
    const rule = await createRule(db, {
      kind: 'expense', name: 'Gasto', amount: 100, account_id: debit.id, category_id: food,
      frequency: 'monthly', start_date: '2026-10-15',
    });
    await expect(updateRule(db, rule.id, { category_id: salary })).rejects.toBeInstanceOf(ValidationError);
    const income = await createRule(db, {
      kind: 'income', name: 'Ingreso', amount: 100, account_id: debit.id,
      frequency: 'monthly', start_date: '2026-10-15',
    });
    await expect(updateRule(db, income.id, { account_id: card.id })).rejects.toBeInstanceOf(ValidationError);
  });

  test("updateGoal en modo 'virtual' borra account_id", async () => {
    const account = await makeAccount(db);
    const goal = await createGoal(db, { name: 'Meta', target_amount: 1000, mode: 'account', account_id: account.id });
    await updateGoal(db, goal.id, { mode: 'virtual' });
    expect((await db.get('SELECT mode, account_id FROM goals WHERE id = ?', [goal.id]))).toEqual({
      mode: 'virtual', account_id: null,
    });
  });

  test('parseAmount convierte 1.005 a 101 centavos', () => {
    expect(parseAmount(1.005)).toBe(101);
  });

  test('rechaza importes mayores que MAX_AMOUNT', async () => {
    const account = await makeAccount(db);
    await expect(createTransaction(db, {
      kind: 'expense', amount: MAX_AMOUNT + 1, account_id: account.id,
      category_id: await categoryId(db, 'Alimentación'), occurred_at: at,
    })).rejects.toBeInstanceOf(ValidationError);
  });

  test('ignora recurring_occurrence_id arbitrario en un movimiento manual', async () => {
    const account = await makeAccount(db);
    const transaction = await createTransaction(db, {
      kind: 'expense', amount: 100, account_id: account.id,
      category_id: await categoryId(db, 'Alimentación'), occurred_at: at,
      recurring_occurrence_id: 'ocurrencia-inventada',
    });
    expect(transaction.recurring_occurrence_id).toBeNull();
    expect((await db.get('SELECT recurring_occurrence_id FROM transactions WHERE id = ?', [transaction.id])).recurring_occurrence_id).toBeNull();
  });

  test('rechaza cambiar kind al editar un movimiento', async () => {
    const account = await makeAccount(db);
    const transaction = await createTransaction(db, {
      kind: 'expense', amount: 100, account_id: account.id,
      category_id: await categoryId(db, 'Alimentación'), occurred_at: at,
    });
    await expect(updateTransaction(db, transaction.id, { kind: 'income' })).rejects.toBeInstanceOf(ValidationError);
  });

  test('el trigger SQL rechaza expense con debt_id mediante db.run', async () => {
    const card = await makeAccount(db, { type: 'credit', credit_limit: 100000 });
    const debt = await createDebt(db, { name: 'Plan', account_id: card.id, balance: 1000 });
    await expect(db.run(
      `INSERT INTO transactions
       (id, kind, amount, currency, account_id, category_id, occurred_at, debt_id, origin, created_at, updated_at)
       VALUES (?, 'expense', 100, 'MXN', ?, ?, ?, ?, 'manual', ?, ?)`,
      ['manual-trigger', card.id, await categoryId(db, 'Alimentación'), at, debt.id, at, at],
    )).rejects.toThrow();
  });

  test('updateAccount no cambia moneda ni fecha inicial cuando hay movimientos', async () => {
    const account = await makeAccount(db, { currency: 'MXN' });
    await createTransaction(db, {
      kind: 'expense', amount: 100, account_id: account.id,
      category_id: await categoryId(db, 'Alimentación'), occurred_at: at,
    });
    await expect(updateAccount(db, account.id, { currency: 'USD' })).rejects.toBeInstanceOf(ValidationError);
    await expect(updateAccount(db, account.id, { initial_balance_date: '2026-02-01' })).rejects.toBeInstanceOf(ValidationError);
  });

  test('syncRecurring con cuenta archivada no lanza y devuelve failed', async () => {
    const account = await makeAccount(db);
    const rule = await createRule(db, {
      kind: 'income', name: 'Ingreso automático', amount: 100, account_id: account.id,
      frequency: 'monthly', start_date: '2026-10-01', auto_post: true,
    }, '2026-10-15');
    await archiveAccount(db, account.id);
    const result = await syncRecurring(db, '2026-10-15');
    expect(result.failed).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: rule.id }),
    ]));
  });
});
