/**
 * Auditoría por escenario: un mes de uso realista con todos los tipos de
 * operación. Tras cada paso se comprueban invariantes contables globales.
 */
import { openTestDb, categoryId, makeAccount } from '../helpers/testDb';
import { getAccountsOverview, reconcileAccount, archiveAccount, deleteAccount } from '../../services/accounts/accountService';
import { createTransaction, updateTransaction, deleteTransaction, duplicateTransaction } from '../../services/transactions/transactionService';
import { createDebt, createFinancedPurchase, registerDebtPayment, reserveForDebt, reconcileDebt, deleteDebt } from '../../services/debts/debtService';
import { createBudget, listBudgetStatus } from '../../services/budgets/budgetService';
import { createRule, syncRecurring, confirmOccurrence } from '../../services/recurring/recurringService';
import { createGoal, moveGoalMoney } from '../../services/goals/goalService';
import { archiveCategory, deleteCategory, createCategory } from '../../services/categories/categoryService';
import { getPeriodSummary } from '../../services/stats/summaryService';
import { prepareImport, buildPreview, commitImport, undoImport } from '../../services/csv/importService';
import { exportTransactionsCSV } from '../../services/csv/exportService';
import { compareWithPrevious } from '../../services/stats/statsService';
import { getUpcoming } from '../../services/stats/upcomingService';
import { ValidationError } from '../../utils/errors';

const PS = { type: 'monthly', weekStartDay: 1, biweeklyMode: 'calendar', monthStartDay: 1 };
let db;
let cat;
let acc;

/** Invariante 1: suma de saldos = saldos iniciales + ingresos − gastos + devoluciones + ajustes. */
async function checkLedger() {
  const accounts = await db.all('SELECT initial_balance FROM accounts');
  const initial = accounts.reduce((s, a) => s + a.initial_balance, 0);
  const t = await db.get(`SELECT
      COALESCE(SUM(CASE WHEN kind='income' THEN amount END),0) AS inc,
      COALESCE(SUM(CASE WHEN kind='expense' THEN amount END),0) AS exp,
      COALESCE(SUM(CASE WHEN kind='refund' THEN amount END),0) AS ref,
      COALESCE(SUM(CASE WHEN kind='adjustment' THEN amount END),0) AS adj
    FROM transactions`);
  const all = await db.all(`SELECT a.id FROM accounts a`);
  const { accountsRepository } = require('../../database/repositories/accountsRepository');
  let total = 0;
  for (const a of all) total += (await accountsRepository.get(db, a.id)).balance;
  expect(total).toBe(initial + t.inc - t.exp + t.ref + t.adj);
  // Invariante 2: el crédito usado de cada tarjeta es su deuda; disponible = límite − usado.
  const ov = await getAccountsOverview(db);
  for (const c of ov.accounts.filter(x => x.type === 'credit')) {
    expect(c.credit.used).toBe(Math.max(0, -c.balance));
    if (c.credit.limit !== null) expect(c.credit.available).toBe(c.credit.limit - c.credit.used + c.credit.inFavor);
  }
  // Invariante 3: el círculo del mes = gastos − devoluciones del mes.
  const s = await getPeriodSummary(db, { periodSettings: PS, ref: '2026-10-15' });
  const m = await db.get(`SELECT
      COALESCE(SUM(CASE WHEN kind='expense' THEN amount END),0) - COALESCE(SUM(CASE WHEN kind='refund' THEN amount END),0) AS net
    FROM transactions WHERE occurred_at >= '2026-10-01' AND occurred_at < '2026-11-01'`);
  expect(s.spent).toBe(Math.max(0, m.net));
  expect(s.segments.reduce((x, y) => x + y.amount, 0)).toBe(Math.max(0, m.net));
  if (s.segments.length) expect(Math.round(s.segments.reduce((x, y) => x + y.percent, 0) * 10) / 10).toBe(100);
  return ov;
}

beforeAll(async () => {
  db = await openTestDb();
  cat = {
    food: await categoryId(db, 'Alimentación'),
    transport: await categoryId(db, 'Transporte'),
    shopping: await categoryId(db, 'Compras'),
    subs: await categoryId(db, 'Suscripciones'),
    salary: await categoryId(db, 'Salario'),
  };
  acc = {
    cash: await makeAccount(db, { name: 'Efectivo', type: 'cash', openingAmount: 150000, initial_balance_date: '2026-10-01' }),
    debit: await makeAccount(db, { name: 'Nómina', type: 'debit', openingAmount: 800000, initial_balance_date: '2026-10-01' }),
    savings: await makeAccount(db, { name: 'Ahorro', type: 'savings', openingAmount: 0, initial_balance_date: '2026-10-01' }),
    nu: await makeAccount(db, { name: 'NU', type: 'credit', openingAmount: 0, credit_limit: 400000, initial_balance_date: '2026-10-01' }),
    oro: await makeAccount(db, { name: 'Oro', type: 'credit', openingAmount: 120000, credit_limit: 1500000, initial_balance_date: '2026-10-01' }),
  };
});
afterAll(() => db.close());

const at = d => `2026-10-${String(d).padStart(2, '0')} 12:00:00`;

test('1. gastos en efectivo, débito y crédito con validación de método', async () => {
  await createTransaction(db, { kind: 'expense', amount: 18000, account_id: acc.cash.id, category_id: cat.food, payment_method: 'cash', occurred_at: at(2) });
  await createTransaction(db, { kind: 'expense', amount: 45050, account_id: acc.debit.id, category_id: cat.transport, payment_method: 'debit', occurred_at: at(3) });
  await createTransaction(db, { kind: 'expense', amount: 60000, account_id: acc.nu.id, category_id: cat.shopping, payment_method: 'credit', occurred_at: at(4) });
  await expect(createTransaction(db, { kind: 'expense', amount: 100, account_id: acc.cash.id, category_id: cat.food, payment_method: 'credit', occurred_at: at(4) })).rejects.toBeInstanceOf(ValidationError);
  await expect(createTransaction(db, { kind: 'expense', amount: -5, account_id: acc.cash.id, category_id: cat.food, occurred_at: at(4) })).rejects.toBeInstanceOf(ValidationError);
  const ov = await checkLedger();
  expect(ov.accounts.find(a => a.id === acc.cash.id).balance).toBe(132000);
});

test('2. financiación previa no incluida + compra financiada nueva en NU (caso del usuario)', async () => {
  await createDebt(db, { name: 'Celular 12 MSI', account_id: acc.nu.id, balance: 240000, monthly_payment: 20000, addToCardDebt: true });
  const { debt } = await createFinancedPurchase(db, { amount: 36000, account_id: acc.nu.id, category_id: cat.shopping, occurred_at: at(5) }, { name: 'Audífonos 3 MSI', monthly_payment: 12000 });
  const ov = await checkLedger();
  const nu = ov.accounts.find(a => a.id === acc.nu.id).credit;
  expect(nu).toMatchObject({ limit: 400000, used: 336000, available: 64000, financed: 276000, revolving: 60000, monthlyDue: 32000 });
  // El ajuste de la financiación previa no es gasto: el gasto de compras es 60,000 + 36,000.
  const s = await getPeriodSummary(db, { periodSettings: PS, ref: '2026-10-15' });
  expect(s.segments.find(x => x.categoryId === cat.shopping).amount).toBe(96000);
  expect(debt.id).toBeTruthy();
});

test('3. ingreso, transferencia, pago a plan y pago general; apartado se libera', async () => {
  await createTransaction(db, { kind: 'income', amount: 1400000, account_id: acc.debit.id, category_id: cat.salary, income_type: 'salary', occurred_at: at(6) });
  await createTransaction(db, { kind: 'transfer', amount: 50000, account_id: acc.debit.id, to_account_id: acc.cash.id, occurred_at: at(6) });
  const plans = await db.all("SELECT id, name FROM debts WHERE account_id = ?", [acc.nu.id]);
  const cel = plans.find(p => p.name.startsWith('Celular'));
  await reserveForDebt(db, cel.id, 20000);
  let ov = await checkLedger();
  expect(ov.reserved).toBe(20000);
  await registerDebtPayment(db, { debtId: cel.id, fromAccountId: acc.debit.id, amount: 20000, occurredAt: at(7) });
  await createTransaction(db, { kind: 'card_payment', amount: 60000, account_id: acc.debit.id, to_account_id: acc.nu.id, occurred_at: at(7) });
  // Pago a un plan de OTRA tarjeta debe rechazarse.
  await expect(createTransaction(db, { kind: 'card_payment', amount: 100, account_id: acc.debit.id, to_account_id: acc.oro.id, debt_id: cel.id, occurred_at: at(7) })).rejects.toBeInstanceOf(ValidationError);
  ov = await checkLedger();
  expect(ov.reserved).toBe(0);
  const nu = ov.accounts.find(a => a.id === acc.nu.id).credit;
  expect(nu.used).toBe(256000);
  expect(nu.available).toBe(144000);
  expect(nu.financed).toBe(256000); // 220,000 celular + 36,000 audífonos
  expect(nu.revolving).toBe(0);
});

test('4. devolución vinculada, edición y borrado mantienen todo cuadrado', async () => {
  const exp = await createTransaction(db, { kind: 'expense', amount: 99900, account_id: acc.oro.id, category_id: cat.shopping, payment_method: 'credit', description: 'Tenis', occurred_at: at(8) });
  await createTransaction(db, { kind: 'refund', amount: 40000, account_id: acc.oro.id, category_id: cat.shopping, related_transaction_id: exp.id, occurred_at: at(9) });
  await expect(createTransaction(db, { kind: 'refund', amount: 60000, account_id: acc.oro.id, category_id: cat.shopping, related_transaction_id: exp.id, occurred_at: at(9) })).rejects.toBeInstanceOf(ValidationError);
  await expect(updateTransaction(db, exp.id, { amount: 30000 })).rejects.toBeInstanceOf(ValidationError); // menor que lo devuelto
  await updateTransaction(db, exp.id, { amount: 89900 });
  const dup = await duplicateTransaction(db, exp.id, at(10));
  await deleteTransaction(db, dup.id);
  await checkLedger();
});

test('5. presupuesto, recurrencias, metas y conciliaciones', async () => {
  await createBudget(db, { category_id: cat.shopping, period_type: 'monthly', amount: 150000 });
  const statuses = await listBudgetStatus(db, PS, '2026-10-15');
  const shop = statuses.find(b => b.category_id === cat.shopping);
  expect(shop.spent).toBe(96000 + 89900 - 40000);
  expect(shop.exceeded).toBe(false);

  const rule = await createRule(db, { kind: 'expense', name: 'Streaming', amount: 19900, account_id: acc.nu.id, category_id: cat.subs, payment_method: 'credit', frequency: 'monthly', start_date: '2026-10-11', auto_post: true }, '2026-10-12');
  await syncRecurring(db, '2026-10-12');
  await syncRecurring(db, '2026-10-12');
  const posted = await db.get("SELECT COUNT(*) AS n FROM transactions WHERE origin = 'recurring_auto'");
  expect(posted.n).toBe(1);
  const salary = await createRule(db, { kind: 'income', name: 'Quincena', amount: 700000, account_id: acc.debit.id, frequency: 'semimonthly', start_date: '2026-10-15' }, '2026-10-12');
  const pending = await db.get("SELECT id FROM recurring_occurrences WHERE rule_id = ? AND due_date = '2026-10-15'", [salary.id]);
  let ov = await checkLedger();
  const before = ov.accounts.find(a => a.id === acc.debit.id).balance;
  await confirmOccurrence(db, pending.id, { occurred_at: at(15) });
  ov = await checkLedger();
  expect(ov.accounts.find(a => a.id === acc.debit.id).balance).toBe(before + 700000);

  const goalV = await createGoal(db, { name: 'Fondo', target_amount: 500000, mode: 'virtual' });
  await moveGoalMoney(db, goalV.id, 100000, {});
  const goalA = await createGoal(db, { name: 'Viaje', target_amount: 300000, mode: 'account', account_id: acc.savings.id });
  await moveGoalMoney(db, goalA.id, 80000, { fromAccountId: acc.debit.id });
  await expect(moveGoalMoney(db, goalA.id, -90000, { toAccountId: acc.debit.id })).rejects.toBeInstanceOf(ValidationError);
  ov = await checkLedger();
  expect(ov.reserved).toBe(180000);
  expect(ov.available).toBe(ov.liquid - 180000);

  await reconcileAccount(db, acc.cash.id, 150000, { occurredAt: at(16) });
  await reconcileAccount(db, acc.oro.id, 200000, { occurredAt: at(16) });
  ov = await checkLedger();
  expect(ov.accounts.find(a => a.id === acc.cash.id).balance).toBe(150000);
  expect(ov.accounts.find(a => a.id === acc.oro.id).credit.used).toBe(200000);
  expect(rule.id).toBeTruthy();
});

test('6. conciliación de plan no toca la tarjeta; borrar plan conserva la deuda de la tarjeta', async () => {
  const aud = await db.get("SELECT id FROM debts WHERE name LIKE 'Aud%'");
  const usedBefore = (await getAccountsOverview(db)).accounts.find(a => a.id === acc.nu.id).credit.used;
  await reconcileDebt(db, aud.id, 24000);
  let nu = (await getAccountsOverview(db)).accounts.find(a => a.id === acc.nu.id).credit;
  expect(nu.used).toBe(usedBefore);
  expect(nu.financed).toBe(220000 + 24000);
  await deleteDebt(db, aud.id);
  nu = (await getAccountsOverview(db)).accounts.find(a => a.id === acc.nu.id).credit;
  expect(nu.used).toBe(usedBefore);
  await checkLedger();
});

test('7. CSV: importar, deshacer y exportar sin descuadres', async () => {
  const csv = 'Fecha;Concepto;Cargo;Abono\n20/10/2026;OXXO;$123.45;\n21/10/2026;Depósito;;1,000.00\n';
  const prepared = prepareImport(csv);
  const preview = await buildPreview(db, prepared, { accountId: acc.debit.id, defaultCategories: { expense: cat.food } });
  const { batchId } = await commitImport(db, { accountId: acc.debit.id, items: preview.items });
  await checkLedger();
  await undoImport(db, batchId);
  await checkLedger();
  const { count } = await exportTransactionsCSV(db);
  const n = await db.get('SELECT COUNT(*) AS n FROM transactions');
  expect(count).toBe(n.n);
});

test('8. categorías: archivar conserva historial; eliminar exige reasignar', async () => {
  const tmp = await createCategory(db, { name: 'Antojos', kind: 'expense', color: '#123456', icon: 'coffee' });
  await createTransaction(db, { kind: 'expense', amount: 5000, account_id: acc.cash.id, category_id: tmp.id, occurred_at: at(22) });
  await archiveCategory(db, tmp.id);
  let s = await getPeriodSummary(db, { periodSettings: PS, ref: '2026-10-15' });
  expect(s.segments.find(x => x.categoryId === tmp.id).archived).toBe(true);
  await expect(deleteCategory(db, tmp.id)).rejects.toBeInstanceOf(ValidationError);
  await deleteCategory(db, tmp.id, { reassignTo: cat.food });
  s = await getPeriodSummary(db, { periodSettings: PS, ref: '2026-10-15' });
  expect(s.segments.find(x => x.categoryId === tmp.id)).toBeUndefined();
  await checkLedger();
});

test('9. cuentas: no se borran con historial; archivadas no cuentan en líquido', async () => {
  await expect(deleteAccount(db, acc.cash.id)).rejects.toBeInstanceOf(ValidationError);
  const before = (await getAccountsOverview(db)).liquid;
  const cashBal = (await getAccountsOverview(db)).accounts.find(a => a.id === acc.cash.id).balance;
  await archiveAccount(db, acc.cash.id, true);
  expect((await getAccountsOverview(db)).liquid).toBe(before - cashBal);
  await expect(createTransaction(db, { kind: 'expense', amount: 100, account_id: acc.cash.id, category_id: cat.food, occurred_at: at(23) })).rejects.toBeInstanceOf(ValidationError);
  await archiveAccount(db, acc.cash.id, false);
  await checkLedger();
});

test('10. estadísticas y próximos pagos coherentes', async () => {
  const cmp = await compareWithPrevious(db, { type: 'monthly', start: '2026-10-01', end: '2026-11-01' }, PS);
  expect(cmp.previousSpending).toBe(0);
  expect(cmp.spending).toBeGreaterThan(0);
  const up = await getUpcoming(db, { today: '2026-10-17', days: 31 });
  // Sin día de pago configurado en las tarjetas: no hay "vence tarjeta" inventado.
  expect(up.items.filter(i => i.type === 'card_due')).toHaveLength(0);
  expect(up.items.every(i => Number.isInteger(i.amount))).toBe(true);
});
