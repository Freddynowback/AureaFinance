import fs from 'node:fs/promises';
import { createAccount, getAccountsOverview } from '../../services/accounts/accountService';
import {
  createDebt,
  createFinancedPurchase,
  effectiveDueDate,
  getDebtDetail,
  reconcileDebt,
  registerDebtPayment,
  reserveForDebt,
} from '../../services/debts/debtService';
import { createBudget, budgetStatus } from '../../services/budgets/budgetService';
import { createRule, syncRecurring } from '../../services/recurring/recurringService';
import { getPeriodSummary } from '../../services/stats/summaryService';
import { getPeriod } from '../../utils/periods';
import { nextMonthlyDate } from '../../utils/dates';
import { ValidationError } from '../../utils/errors';
import { accountsRepository } from '../../database/repositories/accountsRepository';
import { debtsRepository } from '../../database/repositories/debtsRepository';
import { transactionsRepository } from '../../database/repositories/transactionsRepository';
import { createTransaction, deleteTransaction, updateTransaction } from '../../services/transactions/transactionService';
import {
  categoryByName,
  createCashAccount,
  createCreditAccount,
  createDebitAccount,
  openTestDatabase,
  tempDatabasePath,
} from './ledgerHelpers';
import { migrate } from '../../database/migrations';

jest.setTimeout(30000);

const DATE = '2026-10-17 12:00:00';

function expenseInput(accountId, categoryId, amount = 1000, occurred_at = DATE) {
  return {
    kind: 'expense',
    amount,
    account_id: accountId,
    category_id: categoryId,
    payment_method: 'cash',
    occurred_at,
    description: 'Compra de prueba',
  };
}

describe('ledger integration con SQLite real', () => {
  let db;
  let food;
  let other;

  beforeEach(async () => {
    db = await openTestDatabase();
    food = await categoryByName(db, 'Alimentación');
    other = await categoryByName(db, 'Otros');
  });

  afterEach(async () => {
    await db.close();
    jest.restoreAllMocks();
  });

  test('1. gasto en efectivo descuenta del saldo de efectivo', async () => {
    const cash = await createCashAccount(db);
    await createTransaction(db, expenseInput(cash.id, food.id, 1250));
    expect((await accountsRepository.get(db, cash.id)).balance).toBe(98750);
  });

  test('2. ingreso incrementa la cuenta receptora y no crea gasto', async () => {
    const debit = await createDebitAccount(db, { openingAmount: 0 });
    await createTransaction(db, {
      kind: 'income', amount: 25000, account_id: debit.id, occurred_at: DATE, source: 'Nómina',
    });
    const totals = await transactionsRepository.totals(db, '2026-10-01', '2026-11-01');
    expect((await accountsRepository.get(db, debit.id)).balance).toBe(25000);
    expect(totals.income).toBe(25000);
    expect(totals.expenses).toBe(0);
  });

  test('3. compra a crédito aumenta deuda de la tarjeta correcta y reduce crédito disponible', async () => {
    const card = await createCreditAccount(db);
    const { debt } = await createFinancedPurchase(
      db,
      { ...expenseInput(card.id, food.id, 18000), payment_method: 'credit' },
      { name: 'Compra MSI', financing_type: 'msi', next_due_date: '2026-11-15' },
    );
    const account = await accountsRepository.get(db, card.id);
    expect((await debtsRepository.get(db, debt.id)).outstanding).toBe(18000);
    expect(account.balance).toBe(-18000);
    // El crédito disponible lo calcula el resumen de cuentas (no el repositorio).
    const overview = await getAccountsOverview(db);
    expect(overview.accounts.find(a => a.id === card.id).availableCredit).toBe(82000);
  });

  test('4. pago de tarjeta reduce deuda y origen sin contarse como gasto', async () => {
    const debit = await createDebitAccount(db);
    const card = await createCreditAccount(db);
    const { debt } = await createFinancedPurchase(
      db, { ...expenseInput(card.id, food.id, 18000), payment_method: 'credit' },
      { name: 'Compra', financing_type: 'revolving' },
    );
    await registerDebtPayment(db, { debtId: debt.id, fromAccountId: debit.id, amount: 7000, occurredAt: DATE });
    expect((await debtsRepository.get(db, debt.id)).outstanding).toBe(11000);
    expect((await accountsRepository.get(db, debit.id)).balance).toBe(93000);
    expect((await transactionsRepository.totals(db, '2026-10-01', '2026-11-01')).net_spending).toBe(18000);
  });

  test('5. dos tarjetas son independientes y deuda cruzada se rechaza', async () => {
    const cardA = await createCreditAccount(db, { name: 'A' });
    const cardB = await createCreditAccount(db, { name: 'B' });
    const debit = await createDebitAccount(db);
    const a = await createFinancedPurchase(
      db, { ...expenseInput(cardA.id, food.id, 10000), payment_method: 'credit' },
      { name: 'A debt', financing_type: 'other' },
    );
    const b = await createFinancedPurchase(
      db, { ...expenseInput(cardB.id, food.id, 20000), payment_method: 'credit' },
      { name: 'B debt', financing_type: 'other' },
    );
    await registerDebtPayment(db, { debtId: a.debt.id, fromAccountId: debit.id, amount: 4000 });
    expect((await debtsRepository.get(db, a.debt.id)).outstanding).toBe(6000);
    expect((await debtsRepository.get(db, b.debt.id)).outstanding).toBe(20000);
    await expect(createTransaction(db, {
      kind: 'card_payment', amount: 1000, account_id: debit.id, to_account_id: cardA.id,
      debt_id: b.debt.id, occurred_at: DATE,
    })).rejects.toBeInstanceOf(ValidationError);
  });

  test('6. reconcileDebt cambia outstanding, conserva historial y no crea movimiento ni gasto', async () => {
    const card = await createCreditAccount(db);
    const debt = await createDebt(db, {
      name: 'Saldo', account_id: card.id, balance: 30000, financing_type: 'other',
    });
    const before = await transactionsRepository.count(db);
    await reconcileDebt(db, debt.id, 24000, { recordedAt: '2026-10-17 12:00:00' });
    const detail = await getDebtDetail(db, debt.id);
    expect((await debtsRepository.get(db, debt.id)).outstanding).toBe(24000);
    expect(detail.snapshots).toHaveLength(2);
    expect(await transactionsRepository.count(db)).toBe(before);
    expect((await transactionsRepository.totals(db, '2026-10-01', '2026-11-01')).net_spending).toBe(0);
  });

  test('9. porcentajes por categoría suman 100', async () => {
    const cash = await createCashAccount(db);
    await createTransaction(db, expenseInput(cash.id, food.id, 1000));
    await createTransaction(db, expenseInput(cash.id, other.id, 2000));
    const summary = await getPeriodSummary(db, { period: getPeriod('2026-10-17', { type: 'monthly' }) });
    expect(summary.segments.reduce((sum, segment) => sum + segment.percent, 0)).toBe(100);
  });

  test('10. restante del presupuesto semanal es límite menos gasto neto', async () => {
    const cash = await createCashAccount(db);
    await createBudget(db, { period_type: 'weekly', amount: 10000 });
    await createTransaction(db, expenseInput(cash.id, food.id, 3500));
    const summary = await getPeriodSummary(db, {
      period: getPeriod('2026-10-17', { type: 'weekly', weekStartDay: 1 }), remainingMode: 'budget',
    });
    expect(summary.remaining.remaining).toBe(6500);
  });

  test('11. updateTransaction recalcula importe, saldo y presupuesto', async () => {
    const cash = await createCashAccount(db);
    const budget = await createBudget(db, { period_type: 'monthly', amount: 10000 });
    const tx = await createTransaction(db, expenseInput(cash.id, food.id, 3000));
    await updateTransaction(db, tx.id, { amount: 4500 });
    expect((await accountsRepository.get(db, cash.id)).balance).toBe(95500);
    expect((await budgetStatus(db, budget, { type: 'monthly' }, '2026-10-17')).spent).toBe(4500);
  });

  test('12. deleteTransaction restaura saldo', async () => {
    const cash = await createCashAccount(db);
    const tx = await createTransaction(db, expenseInput(cash.id, food.id, 3000));
    await deleteTransaction(db, tx.id);
    expect((await accountsRepository.get(db, cash.id)).balance).toBe(100000);
  });

  test('13. transferencia mueve saldos sin cambiar ingresos ni gastos', async () => {
    const from = await createDebitAccount(db, { openingAmount: 10000 });
    const to = await createCashAccount(db, { openingAmount: 0 });
    await createTransaction(db, {
      kind: 'transfer', amount: 4000, account_id: from.id, to_account_id: to.id,
      occurred_at: DATE, payment_method: 'transfer',
    });
    const totals = await transactionsRepository.totals(db, '2026-10-01', '2026-11-01');
    expect((await accountsRepository.get(db, from.id)).balance).toBe(6000);
    expect((await accountsRepository.get(db, to.id)).balance).toBe(4000);
    expect(totals.income).toBe(0);
    expect(totals.net_spending).toBe(0);
  });

  test('14. devolución vinculada reduce categoría, no ingresos y valida límites/categoría', async () => {
    const cash = await createCashAccount(db);
    const original = await createTransaction(db, expenseInput(cash.id, food.id, 5000));
    await createTransaction(db, {
      kind: 'refund', amount: 1200, account_id: cash.id, category_id: food.id,
      related_transaction_id: original.id, occurred_at: DATE,
    });
    const totals = await transactionsRepository.totals(db, '2026-10-01', '2026-11-01');
    expect(totals.net_spending).toBe(3800);
    expect(totals.income).toBe(0);
    await expect(createTransaction(db, {
      kind: 'refund', amount: 4000, account_id: cash.id, category_id: food.id,
      related_transaction_id: original.id, occurred_at: DATE,
    })).rejects.toBeInstanceOf(ValidationError);
    await expect(createTransaction(db, {
      kind: 'refund', amount: 100, account_id: cash.id, category_id: other.id,
      related_transaction_id: original.id, occurred_at: DATE,
    })).rejects.toBeInstanceOf(ValidationError);
  });

  test('17. operaciones sin red no llaman fetch', async () => {
    global.fetch = jest.fn(() => { throw new Error('red prohibida'); });
    const cash = await createCashAccount(db);
    await createTransaction(db, expenseInput(cash.id, food.id, 100));
    await getPeriodSummary(db, { period: getPeriod('2026-10-17', { type: 'weekly' }) });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('18. periodo sin movimientos produce segmentos vacíos y cero finito', async () => {
    const summary = await getPeriodSummary(db, { period: getPeriod('2026-10-17', { type: 'monthly' }) });
    expect(summary.segments).toEqual([]);
    expect(summary.spent).toBe(0);
    expect(Number.isNaN(summary.spent)).toBe(false);
  });

  test('19. cambios de mes/año separan periodos y fechas avanzan correctamente', async () => {
    const cash = await createCashAccount(db);
    await createTransaction(db, expenseInput(cash.id, food.id, 100, '2026-12-31 12:00:00'));
    await createTransaction(db, expenseInput(cash.id, food.id, 200, '2027-01-01 12:00:00'));
    const dec = await getPeriodSummary(db, { period: getPeriod('2026-12-31', { type: 'monthly' }) });
    const jan = await getPeriodSummary(db, { period: getPeriod('2027-01-01', { type: 'monthly' }) });
    const year = await getPeriodSummary(db, { period: getPeriod('2026-12-31', { type: 'yearly' }) });
    expect(dec.spent).toBe(100);
    expect(jan.spent).toBe(200);
    expect(year.spent).toBe(100);
    const debt = { next_due_date: '2026-01-31' };
    expect(effectiveDueDate(debt, '2026-04-01')).toBe('2026-04-30');
    expect(nextMonthlyDate('2027-02-01', 31)).toBe('2027-02-28');
  });

  test('20. persistencia en archivo reabre datos y no reaplica migraciones', async () => {
    const file = tempDatabasePath('aurea-persistence');
    try {
      const first = await openTestDatabase(file);
      const cash = await createCashAccount(first, { name: 'Persistente' });
      // Cada BD tiene sus propios UUID de categoría: se busca en la BD del archivo.
      const fileFood = await first.get("SELECT id FROM categories WHERE name = 'Alimentación'");
      await createTransaction(first, expenseInput(cash.id, fileFood.id, 1234));
      await first.close();
      const second = await openTestDatabase(file);
      expect((await accountsRepository.get(second, cash.id)).balance).toBe(98766);
      expect(await transactionsRepository.count(second)).toBe(1);
      expect(await migrate(second)).toEqual([]);
      await second.close();
    } finally {
      await fs.rm(file, { force: true });
    }
  });

  test('rollback: compra financiada inválida no deja gasto parcial', async () => {
    const card = await createCreditAccount(db);
    await expect(createFinancedPurchase(
      db, { ...expenseInput(card.id, food.id, 5000), payment_method: 'credit' },
      { name: 'Inválida', financing_type: 'no-es-válido' },
    )).rejects.toBeInstanceOf(ValidationError);
    expect(await transactionsRepository.count(db)).toBe(0);
    expect(await debtsRepository.list(db, { includeClosed: true })).toHaveLength(0);
  });

  test('syncRecurring es idempotente incluso con auto_post', async () => {
    const debit = await createDebitAccount(db);
    const rule = await createRule(db, {
      kind: 'income', name: 'Nómina', amount: 1000, account_id: debit.id,
      frequency: 'monthly', start_date: '2026-10-01', auto_post: true,
    }, '2026-10-17');
    const first = await syncRecurring(db, '2026-10-17');
    const second = await syncRecurring(db, '2026-10-17');
    expect(first.posted).toBeGreaterThan(0);
    expect(second.posted).toBe(0);
    expect(await transactionsRepository.count(db)).toBe(first.posted);
    expect(await db.get('SELECT COUNT(*) AS n FROM recurring_occurrences WHERE rule_id = ?', [rule.id])).toEqual({ n: expect.any(Number) });
  });

  test('registerDebtPayment libera lo apartado usado', async () => {
    const debit = await createDebitAccount(db);
    const card = await createCreditAccount(db);
    const debt = await createDebt(db, { name: 'Apartada', account_id: card.id, balance: 10000, financing_type: 'other' });
    await reserveForDebt(db, debt.id, 6000);
    await registerDebtPayment(db, { debtId: debt.id, fromAccountId: debit.id, amount: 2500 });
    expect((await debtsRepository.get(db, debt.id)).reserved).toBe(3500);
  });
});
