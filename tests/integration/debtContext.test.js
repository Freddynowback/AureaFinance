import { openTestDb, categoryId, makeAccount } from '../helpers/testDb';
import { createDebt, registerDebtPayment, reconcileDebt, reserveForDebt } from '../../services/debts/debtService';
import { buildDebtContext } from '../../services/debts/debtContext';
import { createRule } from '../../services/recurring/recurringService';
import { buildPlan, assessPlan } from '../../services/debts/recommender';
import { debtEvolution } from '../../services/stats/statsService';
import { getAccountsOverview } from '../../services/accounts/accountService';
import { debtsRepository } from '../../database/repositories/debtsRepository';

let db;
let debit;
let card;
beforeEach(async () => {
  db = await openTestDb();
  debit = await makeAccount(db, { name: 'Nómina', openingAmount: 300000, initial_balance_date: '2026-10-01' });
  card = await makeAccount(db, { name: 'Tarjeta', type: 'credit', openingAmount: 0, credit_limit: 2000000 });
});
afterEach(() => db.close());

test('contexto real: disponible descuenta apartados, ingresos previstos y otras deudas', async () => {
  const today = '2026-10-17';
  const a = await createDebt(db, { name: 'Laptop', account_id: card.id, balance: 400000, monthly_payment: 100000, next_due_date: '2026-11-05' });
  const b = await createDebt(db, { name: 'Celular', account_id: card.id, balance: 120000, monthly_payment: 40000, next_due_date: '2026-10-25' });
  await reserveForDebt(db, a.id, 50000);
  await createRule(db, { kind: 'income', name: 'Salario', amount: 350000, account_id: debit.id, frequency: 'weekly', start_date: '2026-10-24' }, today);
  const ctx = await buildDebtContext(db, a.id, { today, deadline: '2026-11-15' });
  expect(ctx.available).toBe(300000 - 50000);
  expect(ctx.incomes.map(i => i.date)).toEqual(['2026-10-24', '2026-10-31', '2026-11-07', '2026-11-14']);
  // Solo la otra deuda (Celular) cuenta como obligación, no la propia.
  expect(ctx.obligations.every(o => o.name === 'Celular')).toBe(true);
  expect(ctx.obligations.map(o => o.date)).toEqual(['2026-10-25', '2026-11-25'].filter(d => d <= '2026-11-15'));
  expect(ctx.interestKnown).toBe(false);
  expect(b.id).toBeTruthy();

  const plan = buildPlan({ outstanding: 400000, reserved: 50000, today, deadline: '2026-11-15', frequency: 'weekly' });
  expect(plan.total).toBe(350000);
  const assessment = assessPlan(plan, ctx, today);
  expect(assessment.missing).not.toContain('saldos de tus cuentas');
});

test('apartar no cambia saldos ni deuda; pagar sí, y libera lo apartado', async () => {
  const d = await createDebt(db, { name: 'MSI', account_id: card.id, balance: 90000 });
  await reserveForDebt(db, d.id, 30000);
  let ov = await getAccountsOverview(db);
  expect(ov.liquid).toBe(300000);
  expect(ov.available).toBe(270000);
  await registerDebtPayment(db, { debtId: d.id, fromAccountId: debit.id, amount: 30000, occurredAt: '2026-10-17 10:00:00' });
  ov = await getAccountsOverview(db);
  expect(ov.liquid).toBe(270000);
  expect(ov.reserved).toBe(0);
  expect(ov.available).toBe(270000);
  expect((await debtsRepository.get(db, d.id)).outstanding).toBe(60000);
});

test('evolución de deuda reconstruye saldos por fecha', async () => {
  const d = await createDebt(db, { name: 'Moto', account_id: card.id, balance: 100000, balance_date: '2026-09-01' });
  await registerDebtPayment(db, { debtId: d.id, fromAccountId: debit.id, amount: 20000, occurredAt: '2026-09-10 12:00:00' });
  await reconcileDebt(db, d.id, 70000, { recordedAt: '2026-10-01 09:00:00' });
  const points = await debtEvolution(db, '2026-09-01', '2026-10-11', 4);
  // Muestras cada 10 días: la primera (10-sep) ya incluye el pago de ese día.
  expect(points[0]).toEqual({ date: '2026-09-10', value: 80000 });
  expect(points.find(p => p.date === '2026-09-30').value).toBe(80000);
  expect(points[points.length - 1].value).toBe(70000);
});
