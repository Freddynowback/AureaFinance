import { openTestDb, categoryId, makeAccount } from '../helpers/testDb';
import { getAccountsOverview } from '../../services/accounts/accountService';
import { createDebt, createFinancedPurchase, registerDebtPayment, reconcileDebt } from '../../services/debts/debtService';
import { createTransaction } from '../../services/transactions/transactionService';
import { totalsRepoCheck } from './creditHelpers';

let db;
let debit;
let nu;
let shopping;
const card = async () => (await getAccountsOverview(db)).accounts.find(a => a.id === nu.id);

beforeEach(async () => {
  db = await openTestDb();
  shopping = await categoryId(db, 'Compras');
  debit = await makeAccount(db, { name: 'Nómina', openingAmount: 1000000 });
  nu = await makeAccount(db, { name: 'NU', type: 'credit', openingAmount: 0, credit_limit: 400000 });
});
afterEach(() => db.close());

test('caso NU: financiación existente no incluida → se suma a lo usado sin crear gasto', async () => {
  // $600 de compras normales ya en la tarjeta
  await createTransaction(db, { kind: 'expense', amount: 60000, account_id: nu.id, category_id: shopping, payment_method: 'credit', occurred_at: '2026-10-10 12:00:00' });
  // Financiación previa de $2,400 a 12 meses ($200/mes) que la tarjeta no reflejaba
  await createDebt(db, { name: 'Celular 12 MSI', account_id: nu.id, balance: 240000, monthly_payment: 20000, addToCardDebt: true });
  const c = (await card()).credit;
  expect(c).toMatchObject({ limit: 400000, used: 300000, available: 100000, financed: 240000, revolving: 60000, monthlyDue: 20000, utilization: 75, unreconciled: 0 });
  await totalsRepoCheck(db, { expenses: 60000 }); // el ajuste no es gasto
});

test('financiación ya incluida en la deuda de la tarjeta no se duplica', async () => {
  const nu2 = await makeAccount(db, { name: 'NU2', type: 'credit', openingAmount: 300000, credit_limit: 400000 });
  await createDebt(db, { name: 'Laptop', account_id: nu2.id, balance: 240000, monthly_payment: 20000, addToCardDebt: false });
  const c = (await getAccountsOverview(db)).accounts.find(a => a.id === nu2.id).credit;
  expect(c.used).toBe(300000);
  expect(c.available).toBe(100000);
  expect(c.unreconciled).toBe(0);
});

test('aviso si las financiaciones superan la deuda registrada', async () => {
  await createDebt(db, { name: 'Olvidada', account_id: nu.id, balance: 50000 });
  const c = (await card()).credit;
  expect(c.used).toBe(0);
  expect(c.unreconciled).toBe(50000);
});

test('pagos y cobros actualizan el crédito disponible; la conciliación mensual del plan no toca la tarjeta', async () => {
  const { debt } = await createFinancedPurchase(
    db,
    { amount: 240000, account_id: nu.id, category_id: shopping, occurred_at: '2026-10-01 10:00:00' },
    { name: 'TV 12 MSI', monthly_payment: 20000 },
  );
  expect((await card()).credit).toMatchObject({ used: 240000, available: 160000, financed: 240000 });
  // Pago del mes del plan
  await registerDebtPayment(db, { debtId: debt.id, fromAccountId: debit.id, amount: 20000, occurredAt: '2026-10-20 10:00:00' });
  expect((await card()).credit).toMatchObject({ used: 220000, available: 180000, financed: 220000 });
  // Nuevo cargo
  await createTransaction(db, { kind: 'expense', amount: 30000, account_id: nu.id, category_id: shopping, payment_method: 'credit', occurred_at: '2026-10-21 10:00:00' });
  expect((await card()).credit).toMatchObject({ used: 250000, available: 150000, revolving: 30000 });
  // Devolución (cobro a favor) a la tarjeta
  await createTransaction(db, { kind: 'refund', amount: 10000, account_id: nu.id, category_id: shopping, occurred_at: '2026-10-22 10:00:00' });
  expect((await card()).credit.available).toBe(160000);
  // Conciliar el plan con el estado de cuenta no altera lo usado de la tarjeta
  await reconcileDebt(db, debt.id, 220000);
  expect((await card()).credit.used).toBe(240000);
});

test('excederse del límite se refleja como disponible negativo', async () => {
  await createTransaction(db, { kind: 'expense', amount: 450000, account_id: nu.id, category_id: shopping, payment_method: 'credit', occurred_at: '2026-10-10 12:00:00' });
  const ov = await getAccountsOverview(db);
  const c = ov.accounts.find(a => a.id === nu.id).credit;
  expect(c.overLimit).toBe(true);
  expect(c.available).toBe(-50000);
  expect(ov.credit).toMatchObject({ limit: 400000, used: 450000, available: -50000 });
});

test('los totales no mezclan monedas: cuentas USD se reportan aparte', async () => {
  const usd = await makeAccount(db, { name: 'Dólares', type: 'savings', currency: 'USD', openingAmount: 10000 });
  const ov = await getAccountsOverview(db);
  expect(ov.liquid).toBe(1000000); // solo la cuenta MXN
  expect(ov.otherCurrencies.USD.liquid).toBe(10000);
  expect(usd.currency).toBe('USD');
});

test('pagar de más deja saldo a favor y aumenta el disponible por encima del límite', async () => {
  await createTransaction(db, { kind: 'expense', amount: 50000, account_id: nu.id, category_id: shopping, payment_method: 'credit', occurred_at: '2026-10-10 12:00:00' });
  await createTransaction(db, { kind: 'card_payment', amount: 60000, account_id: debit.id, to_account_id: nu.id, occurred_at: '2026-10-11 12:00:00' });
  const c = (await card()).credit;
  expect(c).toMatchObject({ used: 0, inFavor: 10000, available: 410000 });
});
