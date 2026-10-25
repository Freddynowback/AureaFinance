import { openTestDb, categoryId, makeAccount } from '../helpers/testDb';
import { createRule } from '../../services/recurring/recurringService';
import { createTransaction } from '../../services/transactions/transactionService';
import { createDebt, reserveForDebt } from '../../services/debts/debtService';
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

test('con tarjeta también cuenta: con plan semanal se aparta desde ya para su pago', async () => {
  await spend(30000, nu);
  const a = await allowance({ frequencies: { [nu.id]: 'weekly' } });
  expect(a.available).toBe(600000);
  expect(a.spentToday).toBe(30000);
  // $5,300 para el 5 nov en semanas: aportaciones el 29 oct y el 5 nov; antes de la quincena toca la primera.
  expect(a.commitments.find(c => c.type === 'card')).toMatchObject({ name: 'NU', date: '2026-11-05', amount: 265000, frequency: 'weekly', partial: true });
  expect(a.afterIncome).toEqual([expect.objectContaining({ name: 'NU', amount: 265000 })]);
  // Con plan mensual se paga entero el 5 nov: no se aparta nada antes de la quincena.
  const monthly = await allowance({ frequencies: { [nu.id]: 'monthly' } });
  expect(monthly.commitments.find(c => c.type === 'card')).toBeUndefined();
});

test('una compra a meses no cuenta como gasto del día (cuenta su mensualidad)', async () => {
  const tx = await spend(1200000, nu);
  const debt = await createDebt(db, { name: 'Laptop', account_id: nu.id, balance: 1200000, monthly_payment: 100000, next_due_date: '2026-11-05', addToCardDebt: false });
  await db.run('UPDATE debts SET origin_transaction_id = ? WHERE id = ?', [tx.id, debt.id]);
  const a = await allowance();
  expect(a.spentToday).toBe(0);
  expect(a.perDay).toBe(71700);
});

test('una tarjeta que vence antes del ingreso se descuenta con lo que toca pagar', async () => {
  await db.run('UPDATE accounts SET payment_due_day = 28 WHERE id = ?', [nu.id]);
  await createDebt(db, { name: 'Audífonos', account_id: nu.id, balance: 60000, monthly_payment: 10000, next_due_date: '2026-10-28', addToCardDebt: false });
  const a = await allowance();
  // $5,000 de deuda: $4,400 sin financiar + $100 de la mensualidad = $4,500.
  expect(a.commitments.find(c => c.type === 'card')).toMatchObject({ name: 'NU', date: '2026-10-28', amount: 440000, partial: false });
  expect(a.commitments.find(c => c.type === 'debt')).toMatchObject({ name: 'Audífonos', date: '2026-10-28', amount: 10000 });
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

test('todas las deudas: se aparta según el periodo elegido y lo apartado no se descuenta dos veces', async () => {
  const laptop = await createDebt(db, { name: 'Laptop', account_id: nu.id, balance: 1200000, monthly_payment: 100000, next_due_date: '2026-11-05', addToCardDebt: false });
  // Mensual (el del círculo): la mensualidad del 5 nov se paga con la quincena.
  let a = await allowance();
  expect(a.commitments.find(c => c.type === 'debt')).toBeUndefined();
  // Semanal: $1,000 en dos aportaciones (29 oct y 5 nov); antes de la quincena, $500.
  a = await allowance({ frequencies: { [laptop.id]: 'weekly' } });
  expect(a.commitments.find(c => c.type === 'debt')).toMatchObject({ name: 'Laptop', date: '2026-11-05', amount: 50000, frequency: 'weekly', partial: true });
  // Si ya apartaste los $500 de esta semana, salen del disponible y no se vuelven a pedir.
  await reserveForDebt(db, laptop.id, 50000);
  const after = await allowance({ frequencies: { [laptop.id]: 'weekly' } });
  expect(after.available).toBe(600000 - 50000);
  expect(after.commitments.find(c => c.type === 'debt')).toBeUndefined();
  expect(after.free).toBe(a.free);
});

test('una deuda sin mensualidad capturada no se estima: se avisa', async () => {
  await createDebt(db, { name: 'Préstamo', account_id: nu.id, balance: 300000, addToCardDebt: false });
  const a = await allowance();
  expect(a.withoutPlan).toEqual(['Préstamo']);
  expect(a.commitments.find(c => c.type === 'debt')).toBeUndefined();
});

test('incluir pagos lejanos: el próximo pago se reparte desde hoy aunque venza mucho después', async () => {
  const moradita = await createDebt(db, { name: 'Moradita', account_id: nu.id, balance: 65170, monthly_payment: 65170, next_due_date: '2026-11-23', addToCardDebt: false });
  const freq = { [moradita.id]: 'weekly' };
  // Apagado: sus 4 semanas empiezan el 2 nov, después de la quincena.
  const off = await allowance({ frequencies: freq, includeLater: false });
  expect(off.commitments.find(c => c.name === 'Moradita')).toBeUndefined();
  // Encendido: 5 semanas desde el 26 oct; antes de la quincena toca una.
  const on = await allowance({ frequencies: freq, includeLater: true });
  const c = on.commitments.find(x => x.name === 'Moradita');
  expect(c).toMatchObject({ date: '2026-11-23', partial: true, frequency: 'weekly' });
  expect(c.amount).toBeGreaterThanOrEqual(13000);
  expect(c.amount).toBeLessThanOrEqual(13200);
});

test('usar solo lo que ingresó: reparte lo que queda del último ingreso, no lo que ya tenías', async () => {
  // Sin ingreso registrado: se usa todo el disponible y se avisa.
  let a = await allowance({ incomeOnly: true });
  expect(a.noIncomeForBase).toBe(true);
  expect(a.base).toBe(600000);
  // Ingreso de $2,000 el 20 oct y $500 de gasto después: quedan $1,500 de ese ingreso.
  await createTransaction(db, { kind: 'income', amount: 200000, account_id: debit.id, occurred_at: '2026-10-20 09:00:00' });
  await spend(50000, debit, '2026-10-22 12:00:00');
  // Con tarjeta no baja lo líquido: no cuenta aquí (se aparta con el plan de la tarjeta).
  await spend(30000, nu, '2026-10-22 13:00:00');
  a = await allowance({ incomeOnly: true });
  expect(a).toMatchObject({ baseMode: 'income', baseSince: '2026-10-20', base: 150000, available: 750000 });
  expect(a.free).toBe(150000 - 52900 - 44700);
  // Apagado: todo el disponible.
  expect((await allowance()).base).toBe(750000);
});
