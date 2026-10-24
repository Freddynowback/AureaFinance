import { openTestDb, categoryId, makeAccount } from '../helpers/testDb';
import { createRule } from '../../services/recurring/recurringService';
import { createTransaction } from '../../services/transactions/transactionService';
import { createDebt } from '../../services/debts/debtService';
import { addPlannedSpend, deletePlannedSpend, getDailyAllowance } from '../../services/stats/dailyAllowanceService';

const TODAY = '2026-10-24';
const PERIOD = { type: 'monthly', monthStartDay: 1, weekStartDay: 1 };

let db;
let debit;
let nu;
let food;
beforeEach(async () => {
  db = await openTestDb();
  food = await categoryId(db, 'Compras');
  debit = await makeAccount(db, { name: 'Nómina', openingAmount: 600000, initial_balance_date: '2026-10-01' });
  nu = await makeAccount(db, { name: 'NU', type: 'credit', openingAmount: 500000, statement_day: 20, payment_due_day: 5, initial_balance_date: '2026-10-01' });
  // Quincena el 31; Spotify el 28 e internet el 30.
  await createRule(db, { kind: 'income', name: 'Quincena', amount: 900000, account_id: debit.id, frequency: 'semimonthly', start_date: '2026-10-31' }, TODAY);
  await createRule(db, { kind: 'expense', name: 'Spotify', amount: 12900, account_id: debit.id, category_id: food, frequency: 'monthly', start_date: '2026-10-28' }, TODAY);
  await createRule(db, { kind: 'expense', name: 'Internet', amount: 40000, account_id: debit.id, category_id: food, frequency: 'monthly', start_date: '2026-10-30' }, TODAY);
});
afterEach(() => db.close());

const allowance = (opts = {}) => getDailyAllowance(db, { today: TODAY, periodSettings: PERIOD, cushion: 44700, ...opts });
const spend = (amount, account = debit, at = `${TODAY} 20:00:00`) =>
  createTransaction(db, { kind: 'expense', amount, account_id: account.id, category_id: food, payment_method: account.type === 'credit' ? 'credit' : 'debit', occurred_at: at });

test('reparte lo libre hasta la quincena: disponible − pagos antes del 31 − colchón, entre 7 días', async () => {
  const a = await allowance();
  expect(a.horizon).toBe('2026-10-31');
  expect(a.days).toBe(7);
  expect(a.commitments.map(c => [c.name, c.amount])).toEqual([['Spotify', 12900], ['Internet', 40000]]);
  expect(a.free).toBe(600000 - 52900 - 44700);
  expect(a.perDay).toBe(71700); // $5,024 / 7 = $717.71 → $717
  expect(a.allowance).toBe(71700);
  expect(a.leftToday).toBe(71700);
  // La NU vence el 5 nov, después de la quincena: no se descuenta, pero se avisa.
  expect(a.afterIncome).toEqual([expect.objectContaining({ name: 'NU', date: '2026-11-05', amount: 500000 })]);
  expect(a.shortfall).toBe(0);
});

test('si un día gastas de más, el resto de los días baja solo', async () => {
  await spend(120000);
  const a = await allowance();
  expect(a.allowance).toBe(71700); // lo de hoy no cambia
  expect(a.spentToday).toBe(120000);
  expect(a.leftToday).toBe(71700 - 120000);
  expect(a.tomorrowPerDay).toBe(63700); // ($5,024 − $1,200) / 6 = $637.33
  // Al día siguiente, con 6 días, lo libre ya descuenta la salida.
  const next = await allowance({ today: '2026-10-25' });
  expect(next.days).toBe(6);
  expect(next.perDay).toBe(63700);
});

test('con tarjeta también cuenta, aunque no baje el saldo líquido', async () => {
  await spend(30000, nu);
  const a = await allowance();
  expect(a.available).toBe(600000);
  expect(a.spentToday).toBe(30000);
  expect(a.cardSpending).toBe(30000);
  expect(a.tomorrowPerDay).toBe(78700); // ($5,024 − $300) / 6
});

test('una compra a meses no cuenta como gasto del día (cuenta su mensualidad)', async () => {
  const tx = await spend(1200000, nu);
  const debt = await createDebt(db, { name: 'Laptop', account_id: nu.id, balance: 1200000, monthly_payment: 100000, next_due_date: '2026-11-05', addToCardDebt: false });
  await db.run('UPDATE debts SET origin_transaction_id = ? WHERE id = ?', [tx.id, debt.id]);
  const a = await allowance();
  expect(a.spentToday).toBe(0);
  expect(a.cardSpending).toBe(0);
  expect(a.perDay).toBe(71700);
});

test('una tarjeta que vence antes del ingreso se descuenta con lo que toca pagar', async () => {
  await db.run('UPDATE accounts SET payment_due_day = 28 WHERE id = ?', [nu.id]);
  await createDebt(db, { name: 'Audífonos', account_id: nu.id, balance: 60000, monthly_payment: 10000, next_due_date: '2026-10-28', addToCardDebt: false });
  const a = await allowance();
  // $5,000 de deuda: $4,400 sin financiar + $100 de mensualidad = $4,500.
  expect(a.commitments.find(c => c.type === 'card')).toMatchObject({ name: 'NU', date: '2026-10-28', amount: 450000 });
  expect(a.afterIncome).toEqual([]);
  expect(a.free).toBe(600000 - 52900 - 450000 - 44700);
});

test('salida planeada: se aparta de los días previos y se suma a su día', async () => {
  const p = await addPlannedSpend(db, { planned_date: '2026-10-30', amount: 100000, note: 'Cena' }, TODAY);
  let a = await allowance();
  expect(a.plannedTotal).toBe(100000);
  expect(a.perDay).toBe(57400); // ($5,024 − $1,000) / 7
  expect(a.allowance).toBe(57400);
  // Ese día: lo normal + lo planeado.
  await addPlannedSpend(db, { planned_date: TODAY, amount: 50000 }, TODAY);
  a = await allowance();
  expect(a.plannedToday).toBe(50000);
  expect(a.allowance).toBe(a.perDay + 50000);
  // Mañana: lo normal + lo planeado para mañana.
  await addPlannedSpend(db, { planned_date: '2026-10-25', amount: 30000 }, TODAY);
  a = await allowance();
  expect(a.tomorrowAllowance).toBe(a.tomorrowPerDay + 30000);
  await deletePlannedSpend(db, p.id);
  expect((await allowance()).plannedTotal).toBe(80000);
});

test('valida la salida planeada', async () => {
  await expect(addPlannedSpend(db, { planned_date: '2026-10-01', amount: 100 }, TODAY)).rejects.toMatchObject({ fields: { planned_date: 'La fecha ya pasó' } });
  await expect(addPlannedSpend(db, { planned_date: TODAY, amount: null }, TODAY)).rejects.toMatchObject({ fields: { amount: 'Escribe el importe' } });
});

test('si no alcanza para los pagos: $0 hoy y cuánto falta', async () => {
  await createRule(db, { kind: 'expense', name: 'Renta', amount: 700000, account_id: debit.id, category_id: food, frequency: 'monthly', start_date: '2026-10-29' }, TODAY);
  const a = await allowance();
  expect(a.allowance).toBe(0);
  expect(a.perDay).toBe(0);
  expect(a.shortfall).toBe(52900 + 700000 + 44700 - 600000);
});

test('sin ingreso recurrente reparte hasta el fin del periodo; un ingreso sin confirmar se avisa', async () => {
  await db.run("DELETE FROM recurring_occurrences WHERE rule_id IN (SELECT id FROM recurring_rules WHERE kind = 'income')");
  let a = await allowance();
  expect(a.horizonSource).toBe('period');
  expect(a.horizon).toBe('2026-11-01');
  expect(a.days).toBe(8);
  await createRule(db, { kind: 'income', name: 'Pago', amount: 100000, account_id: debit.id, frequency: 'semimonthly', start_date: '2026-10-15' }, TODAY);
  a = await allowance();
  expect(a.pendingIncome).toEqual({ name: 'Pago', date: '2026-10-15' });
  expect(a.horizon).toBe('2026-10-31');
});
