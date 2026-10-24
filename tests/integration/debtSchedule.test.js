import { openTestDb, categoryId, makeAccount } from '../helpers/testDb';
import { Database } from '../../database/Database';
import { migrate, MIGRATIONS } from '../../database/migrations';
import { getAccountsOverview } from '../../services/accounts/accountService';
import { createDebt, getDebtDetail, listDebts, registerDebtPayment, updateDebt } from '../../services/debts/debtService';
import { buildDebtContext } from '../../services/debts/debtContext';
import { scheduleStatus } from '../../services/debts/schedule';
import { getUpcoming } from '../../services/stats/upcomingService';
import { planScheduled } from '../../services/notifications/notificationPlanner';
import { createTransaction } from '../../services/transactions/transactionService';
import { debtsRepository } from '../../database/repositories/debtsRepository';
const { createNodeSqliteDriver } = require('../helpers/nodeSqliteDriver');

const TODAY = '2026-10-24';
// Lo que muestra la app del banco para los próximos meses (todas las compras a meses juntas).
const NU_MONTHS = [
  { due_date: '2026-11-05', amount: 125000 },
  { due_date: '2026-12-05', amount: 125000 },
  { due_date: '2027-01-05', amount: 98000 },
];

let db;
let debit;
let nu;
let shopping;
beforeEach(async () => {
  db = await openTestDb();
  shopping = await categoryId(db, 'Compras');
  debit = await makeAccount(db, { name: 'Nómina', openingAmount: 2000000, initial_balance_date: '2026-10-01' });
  // Tarjeta con $5,000 de deuda revuelta: incluye las compras a meses y $1,520 sin financiar.
  nu = await makeAccount(db, { name: 'NU', type: 'credit', openingAmount: 500000, credit_limit: 1000000, statement_day: 20, payment_due_day: 5, initial_balance_date: '2026-10-01' });
});
afterEach(() => db.close());

const legacyPlan = () => createDebt(db, { name: 'Compras a meses anteriores', account_id: nu.id, schedule: NU_MONTHS, addToCardDebt: false });
const cardOf = async () => (await getAccountsOverview(db, TODAY)).accounts.find(a => a.id === nu.id);

test('calendario ya incluido: saldo = suma de los meses y la deuda de la tarjeta no cambia', async () => {
  const debt = await legacyPlan();
  const [d] = await listDebts(db, undefined, TODAY);
  expect(d.id).toBe(debt.id);
  expect(d.outstanding).toBe(348000);
  expect(d.monthly_payment).toBeNull();
  expect(d.monthlyDue).toBe(125000);
  expect(d.effectiveDueDate).toBe('2026-11-05');
  expect(d.installmentsLeft).toBe(3);
  const c = (await cardOf()).credit;
  expect(c).toMatchObject({ used: 500000, financed: 348000, revolving: 152000, monthlyDue: 125000, dueNow: 277000, plansWithoutMonthly: 0 });
});

test('los pagos vinculados avanzan el calendario mes a mes, también en parte', async () => {
  const debt = await legacyPlan();
  await registerDebtPayment(db, { debtId: debt.id, fromAccountId: debit.id, amount: 125000, occurredAt: '2026-11-04 10:00:00' });
  let { debt: d } = await getDebtDetail(db, debt.id);
  expect(d.effectiveDueDate).toBe('2026-12-05');
  expect(d.monthlyDue).toBe(125000);
  expect(d.schedule.paidCount).toBe(1);
  // Pago parcial del segundo mes: queda lo que falta de ese mes.
  await registerDebtPayment(db, { debtId: debt.id, fromAccountId: debit.id, amount: 100000, occurredAt: '2026-12-04 10:00:00' });
  ({ debt: d } = await getDebtDetail(db, debt.id));
  expect(d.effectiveDueDate).toBe('2026-12-05');
  expect(d.monthlyDue).toBe(25000);
  // Se liquida el resto.
  await registerDebtPayment(db, { debtId: debt.id, fromAccountId: debit.id, amount: 123000, occurredAt: '2027-01-04 10:00:00' });
  ({ debt: d } = await getDebtDetail(db, debt.id));
  expect(d.outstanding).toBe(0);
  expect(d.monthlyDue).toBeNull();
  expect(d.effectiveDueDate).toBeNull();
  expect(d.schedule.paidCount).toBe(3);
});

test('widget: próximo pago = sin financiar + mensualidad, no la deuda total', async () => {
  await legacyPlan();
  const up = await getUpcoming(db, { today: TODAY });
  const cardDue = up.items.find(i => i.type === 'card_due');
  expect(cardDue.amount).toBe(152000 + 125000);
  expect(cardDue.amountIsEstimate).toBe(false);
  expect(cardDue.breakdown).toEqual({ revolving: 152000, monthlyDue: 125000, plansCount: 1, plansWithoutMonthly: 0, totalDebt: 500000 });
  // La financiación también aparece con su mes, no con su saldo completo.
  const debtDue = up.items.find(i => i.type === 'debt_due');
  expect(debtDue).toMatchObject({ amount: 125000, date: '2026-11-05', amountIsEstimate: false });
});

test('un gasto nuevo con la tarjeta se suma a lo que toca pagar (no está financiado)', async () => {
  await legacyPlan();
  await createTransaction(db, { kind: 'expense', amount: 80000, account_id: nu.id, category_id: shopping, payment_method: 'credit', occurred_at: '2026-10-23 12:00:00' });
  const cardDue = (await getUpcoming(db, { today: TODAY })).items.find(i => i.type === 'card_due');
  expect(cardDue.breakdown.revolving).toBe(152000 + 80000);
  expect(cardDue.amount).toBe(152000 + 80000 + 125000);
  expect(cardDue.breakdown.totalDebt).toBe(580000);
});

test('pago fijo y calendario se suman; un plan sin pago mensual no se estima', async () => {
  await legacyPlan();
  await createDebt(db, { name: 'Audífonos 6 MSI', account_id: nu.id, balance: 60000, monthly_payment: 10000, next_due_date: '2026-11-05', addToCardDebt: true });
  await createDebt(db, { name: 'Sin datos', account_id: nu.id, balance: 20000, addToCardDebt: true });
  const c = (await cardOf()).credit;
  expect(c.used).toBe(580000);
  expect(c.financed).toBe(348000 + 60000 + 20000);
  expect(c.monthlyDue).toBe(125000 + 10000);
  expect(c.plansWithoutMonthly).toBe(1);
  const cardDue = (await getUpcoming(db, { today: TODAY })).items.find(i => i.type === 'card_due');
  expect(cardDue.amount).toBe(152000 + 135000);
  expect(cardDue.amountIsEstimate).toBe(true);
  const [n] = planScheduled({
    settings: { 'notifications.enabled': true, 'notifications.cardDue': true, 'notifications.daysBefore': 2, 'notifications.hour': 9 },
    upcoming: [cardDue],
    now: new Date(2026, 9, 24, 8, 0, 0),
  });
  expect(n.body).toMatch(/A pagar: \$2,870/);
  expect(n.body).toMatch(/Sin incluir 1 financiación sin pago mensual/);
});

test('editar el calendario reemplaza los meses que faltan y concilia el saldo a su suma', async () => {
  const debt = await legacyPlan();
  await registerDebtPayment(db, { debtId: debt.id, fromAccountId: debit.id, amount: 125000, occurredAt: '2026-11-04 10:00:00' });
  // El banco ahora muestra otros montos para los meses que faltan.
  await updateDebt(db, debt.id, { schedule: [{ due_date: '2026-12-05', amount: 130000 }, { due_date: '2027-01-05', amount: 90000 }] });
  const { debt: d, history } = await getDebtDetail(db, debt.id);
  expect(d.outstanding).toBe(220000);
  expect(d.monthlyDue).toBe(130000);
  expect(d.schedule.items).toHaveLength(2);
  expect(history[history.length - 1]).toMatchObject({ type: 'snapshot', amount: 220000, note: 'Calendario de pagos actualizado' });
  // Pasar a pago fijo borra el calendario y conserva el saldo.
  await updateDebt(db, debt.id, { schedule: null, monthly_payment: 50000, next_due_date: '2026-12-05' });
  const { debt: fixed } = await getDebtDetail(db, debt.id);
  expect(fixed.schedule).toBeNull();
  expect(fixed.outstanding).toBe(220000);
  expect(fixed.monthlyDue).toBe(50000);
  expect(await debtsRepository.scheduleItems(db, debt.id)).toEqual([]);
});

test('marcar liquidada no toca el calendario', async () => {
  const debt = await legacyPlan();
  await updateDebt(db, debt.id, { status: 'paid' });
  expect(await debtsRepository.scheduleItems(db, debt.id)).toHaveLength(3);
});

test('valida los meses: al menos uno, sin fechas repetidas e importes positivos', async () => {
  await expect(createDebt(db, { name: 'X', account_id: nu.id, schedule: [] })).rejects.toMatchObject({ fields: { schedule: 'Agrega al menos un mes' } });
  await expect(
    createDebt(db, { name: 'X', account_id: nu.id, schedule: [{ due_date: '2026-11-05', amount: 100 }, { due_date: '2026-11-05', amount: 100 }] }),
  ).rejects.toMatchObject({ fields: { 'schedule.1.due_date': 'Fecha repetida' } });
  await expect(createDebt(db, { name: 'X', account_id: nu.id, schedule: [{ due_date: '2026-11-05', amount: null }] })).rejects.toMatchObject({
    fields: { 'schedule.0.amount': 'Escribe el importe' },
  });
  expect(await listDebts(db)).toEqual([]);
});

test('el recomendador toma cada mes del calendario como obligación real', async () => {
  await legacyPlan();
  const other = await createDebt(db, { name: 'Otra', account_id: nu.id, balance: 10000, addToCardDebt: true });
  const ctx = await buildDebtContext(db, other.id, { today: TODAY, deadline: '2026-12-31' });
  expect(ctx.obligations).toEqual([
    { date: '2026-11-05', amount: 125000, name: 'Compras a meses anteriores' },
    { date: '2026-12-05', amount: 125000, name: 'Compras a meses anteriores' },
  ]);
});

test('eliminar la deuda elimina su calendario', async () => {
  const debt = await legacyPlan();
  await db.run('DELETE FROM debts WHERE id = ?', [debt.id]);
  expect(await debtsRepository.allScheduleItems(db)).toEqual([]);
});

test('scheduleStatus: saldo mayor que el calendario se marca como exceso', () => {
  const st = scheduleStatus([{ due_date: '2026-11-05', amount: 100 }, { due_date: '2026-12-05', amount: 50 }], 200);
  expect(st.excess).toBe(50);
  expect(st.current).toMatchObject({ due_date: '2026-11-05', amount: 100 });
  expect(scheduleStatus([{ due_date: '2026-11-05', amount: 100 }], 0).current).toBeNull();
});

test('actualizar desde la versión 0.01 (migración 2) conserva los datos', async () => {
  const old = new Database(createNodeSqliteDriver(':memory:'));
  await old.run('PRAGMA foreign_keys = ON');
  await migrate(old, MIGRATIONS.filter(m => m.version <= 2));
  await old.run(
    `INSERT INTO accounts (id, name, type, initial_balance, initial_balance_date, credit_limit, created_at, updated_at)
     VALUES ('a1', 'NU', 'credit', -500000, '2026-10-01', 1000000, '2026-10-01', '2026-10-01')`,
  );
  await old.run(
    `INSERT INTO debts (id, name, account_id, financing_type, monthly_payment, currency, created_at, updated_at)
     VALUES ('d1', 'Celular', 'a1', 'msi', 20000, 'MXN', '2026-10-01', '2026-10-01')`,
  );
  const before = { accounts: await old.all('SELECT * FROM accounts'), debts: await old.all('SELECT * FROM debts') };
  const applied = await migrate(old);
  expect(applied).toEqual([3]);
  expect(before.accounts).toHaveLength(1);
  expect(await old.all('SELECT * FROM accounts')).toEqual(before.accounts);
  expect(await old.all('SELECT * FROM debts')).toEqual(before.debts);
  expect(await old.all('SELECT * FROM debt_schedule_items')).toEqual([]);
  await old.close();
});
