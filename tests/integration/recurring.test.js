import { createRule, syncRecurring, confirmOccurrence, skipOccurrence, updateRule } from '../../services/recurring/recurringService';
import { deleteTransaction } from '../../services/transactions/transactionService';
import { accountsRepository } from '../../database/repositories/accountsRepository';
import { transactionsRepository } from '../../database/repositories/transactionsRepository';
import { openTestDb, categoryId, makeAccount } from '../helpers/testDb';

jest.setTimeout(30000);

const TODAY = '2026-10-17';

async function occurrences(db, ruleId) {
  return db.all(
    'SELECT * FROM recurring_occurrences WHERE rule_id = ? ORDER BY due_date',
    [ruleId],
  );
}

async function incomeRule(db, accountId, overrides = {}) {
  return createRule(db, {
    kind: 'income',
    name: 'Ingreso recurrente',
    amount: 1000,
    account_id: accountId,
    frequency: 'monthly',
    start_date: '2026-10-01',
    ...overrides,
  }, TODAY);
}

describe('recurrencias con SQLite real', () => {
  let db;

  beforeEach(async () => {
    db = await openTestDb();
  });

  afterEach(async () => {
    await db.close();
  });

  test('mensual conserva anchorDay cuando el inicio es el día 31', async () => {
    const account = await makeAccount(db);
    const rule = await incomeRule(db, account.id, { start_date: '2026-10-31' });

    await syncRecurring(db, '2026-11-01');
    await syncRecurring(db, '2026-12-01');
    await syncRecurring(db, '2027-01-01');
    await syncRecurring(db, '2027-02-01');

    expect((await occurrences(db, rule.id)).map(o => o.due_date)).toEqual([
      '2026-10-31', '2026-11-30', '2026-12-31', '2027-01-31', '2027-02-28',
    ]);
  });

  test('semimonthly genera el día 15 y el último día de cada mes', async () => {
    const account = await makeAccount(db);
    const rule = await incomeRule(db, account.id, {
      frequency: 'semimonthly',
      start_date: '2026-10-15',
    });

    await syncRecurring(db, '2026-11-01');
    expect((await occurrences(db, rule.id)).map(o => o.due_date)).toEqual([
      '2026-10-15', '2026-10-31', '2026-11-15', '2026-11-30', '2026-12-15',
    ]);
  });

  test('end_date detiene la generación después de la fecha final', async () => {
    const account = await makeAccount(db);
    const rule = await incomeRule(db, account.id, {
      start_date: '2026-10-31',
      end_date: '2026-12-31',
    });

    await syncRecurring(db, '2026-12-01');
    expect((await occurrences(db, rule.id)).map(o => o.due_date)).toEqual([
      '2026-10-31', '2026-11-30', '2026-12-31',
    ]);
  });

  test('una regla pausada no genera ocurrencias ni auto-registra movimientos', async () => {
    const account = await makeAccount(db);
    const rule = await incomeRule(db, account.id, {
      status: 'paused',
      auto_post: true,
      start_date: '2026-10-01',
    });

    const result = await syncRecurring(db, TODAY);
    expect(result).toEqual({ generated: 0, posted: 0, failed: [] });
    expect(await occurrences(db, rule.id)).toEqual([]);
    expect(await transactionsRepository.count(db)).toBe(0);
  });

  test('syncRecurring tres veces no duplica ocurrencias ni movimientos', async () => {
    const account = await makeAccount(db);
    const rule = await incomeRule(db, account.id, { auto_post: true });

    await syncRecurring(db, TODAY);
    await syncRecurring(db, TODAY);
    await syncRecurring(db, TODAY);

    const all = await occurrences(db, rule.id);
    expect(new Set(all.map(o => o.due_date)).size).toBe(all.length);
    expect(await transactionsRepository.count(db)).toBe(1);
    expect(all.filter(o => o.status === 'confirmed')).toHaveLength(1);
  });

  test('auto_post solo registra vencidas y nunca futuras', async () => {
    const account = await makeAccount(db);
    const rule = await incomeRule(db, account.id, {
      auto_post: true,
      start_date: '2026-10-16',
    });

    const result = await syncRecurring(db, TODAY);
    const all = await occurrences(db, rule.id);
    expect(result.posted).toBe(1);
    expect(all.find(o => o.due_date === '2026-10-16').status).toBe('confirmed');
    expect(all.find(o => o.due_date === '2026-11-16').status).toBe('pending');
    expect(await transactionsRepository.count(db)).toBe(1);
  });

  test('un ingreso previsto no cambia el saldo hasta confirmOccurrence', async () => {
    const account = await makeAccount(db);
    const rule = await incomeRule(db, account.id, { start_date: TODAY });
    const occurrence = (await occurrences(db, rule.id))[0];

    expect((await accountsRepository.get(db, account.id)).balance).toBe(0);
    const transaction = await confirmOccurrence(db, occurrence.id, {
      occurred_at: `${TODAY} 09:00:00`,
    });
    expect(transaction.amount).toBe(1000);
    expect((await accountsRepository.get(db, account.id)).balance).toBe(1000);
  });

  test('confirmOccurrence dos veces lanza error', async () => {
    const account = await makeAccount(db);
    const rule = await incomeRule(db, account.id, { start_date: TODAY });
    const occurrence = (await occurrences(db, rule.id))[0];

    await confirmOccurrence(db, occurrence.id, { occurred_at: `${TODAY} 09:00:00` });
    await expect(confirmOccurrence(db, occurrence.id)).rejects.toThrow('Ya estaba confirmada');
  });

  test('skipOccurrence evita el registro', async () => {
    const account = await makeAccount(db);
    const rule = await incomeRule(db, account.id, { start_date: TODAY });
    const occurrence = (await occurrences(db, rule.id))[0];

    await skipOccurrence(db, occurrence.id);
    await syncRecurring(db, TODAY);
    expect((await db.get('SELECT status FROM recurring_occurrences WHERE id = ?', [occurrence.id])).status).toBe('skipped');
    expect(await transactionsRepository.count(db)).toBe(0);
  });

  test('borrar un auto-registro marca skipped y sync no lo vuelve a crear', async () => {
    const account = await makeAccount(db);
    const rule = await incomeRule(db, account.id, { auto_post: true, start_date: TODAY });

    await syncRecurring(db, TODAY);
    const transaction = await db.get('SELECT * FROM transactions LIMIT 1');
    await deleteTransaction(db, transaction.id);
    expect((await db.get('SELECT status FROM recurring_occurrences WHERE rule_id = ?', [rule.id])).status).toBe('skipped');

    await syncRecurring(db, TODAY);
    expect(await transactionsRepository.count(db)).toBe(0);
    expect((await db.get('SELECT status FROM recurring_occurrences WHERE rule_id = ?', [rule.id])).status).toBe('skipped');
  });

  test('borrar un movimiento confirmado manualmente vuelve la ocurrencia a pending', async () => {
    const account = await makeAccount(db);
    const rule = await incomeRule(db, account.id, { start_date: TODAY });
    const occurrence = (await occurrences(db, rule.id))[0];

    const transaction = await confirmOccurrence(db, occurrence.id, { occurred_at: `${TODAY} 09:00:00` });
    await deleteTransaction(db, transaction.id);
    expect((await db.get('SELECT status FROM recurring_occurrences WHERE id = ?', [occurrence.id])).status).toBe('pending');
  });

  test('updateRule cambia importe en pendientes futuras y conserva confirmadas', async () => {
    const account = await makeAccount(db);
    const rule = await incomeRule(db, account.id, { start_date: TODAY });
    const first = (await occurrences(db, rule.id))[0];
    await confirmOccurrence(db, first.id, { occurred_at: `${TODAY} 09:00:00` });

    await updateRule(db, rule.id, { amount: 2500 }, TODAY);
    const all = await occurrences(db, rule.id);
    const confirmed = all.find(o => o.id === first.id);
    const future = all.find(o => o.status === 'pending');
    expect(confirmed.amount).toBe(1000);
    expect(future.amount).toBe(2500);
  });

  test('las reglas de gasto usan una categoría real y respetan el saldo al confirmar', async () => {
    const account = await makeAccount(db);
    const category = await categoryId(db, 'Alimentación');
    const rule = await createRule(db, {
      kind: 'expense',
      name: 'Renta',
      amount: 3000,
      account_id: account.id,
      category_id: category,
      payment_method: 'debit',
      frequency: 'monthly',
      start_date: TODAY,
    }, TODAY);
    const occurrence = (await occurrences(db, rule.id))[0];

    expect((await accountsRepository.get(db, account.id)).balance).toBe(0);
    await confirmOccurrence(db, occurrence.id, { occurred_at: `${TODAY} 09:00:00` });
    expect((await accountsRepository.get(db, account.id)).balance).toBe(-3000);
  });
});
