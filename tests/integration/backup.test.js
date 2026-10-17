import { LATEST_VERSION } from '../../database/migrations';
import { openTestDb, categoryId, makeAccount } from '../helpers/testDb';
import { buildBackup } from '../../services/csv/exportService';
import { createTransaction } from '../../services/transactions/transactionService';
import { createBudget } from '../../services/budgets/budgetService';
import { setSettings } from '../../services/settings/settingsService';

describe('buildBackup integration', () => {
  let db;
  beforeEach(async () => {
    db = await openTestDb();
  });
  afterEach(() => db.close());

  test('incluye metadatos, filas de todas las tablas de respaldo y excluye tablas internas', async () => {
    const account = await makeAccount(db, { name: 'Cuenta respaldo' });
    const category = await categoryId(db, 'Alimentación');
    await createTransaction(db, {
      kind: 'expense',
      amount: 1250,
      account_id: account.id,
      category_id: category,
      payment_method: 'debit',
      occurred_at: '2026-10-17 12:00:00',
    });
    await createBudget(db, { period_type: 'monthly', amount: 50000, category_id: category });
    await setSettings(db, { 'onboarding.done': true });

    const backup = JSON.parse(await buildBackup(db));
    expect(backup).toEqual(expect.objectContaining({
      app: 'AureaFinance',
      format: 1,
      schemaVersion: LATEST_VERSION,
      data: expect.any(Object),
    }));

    const expectedTables = [
      'accounts', 'categories', 'debts', 'transactions', 'debt_balance_snapshots', 'goals',
      'reservations', 'budgets', 'recurring_rules', 'recurring_occurrences', 'import_batches', 'settings',
    ];
    expect(Object.keys(backup.data).sort()).toEqual(expectedTables.sort());
    expect(backup.data.accounts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: account.id, name: 'Cuenta respaldo' }),
    ]));
    expect(backup.data.transactions).toEqual(expect.arrayContaining([
      expect.objectContaining({ amount: 1250, account_id: account.id, category_id: category }),
    ]));
    expect(backup.data.budgets).toEqual(expect.arrayContaining([
      expect.objectContaining({ amount: 50000, category_id: category }),
    ]));
    expect(backup.data.settings).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'onboarding.done', value: 'true' }),
    ]));
    expect(backup.data.change_log).toBeUndefined();
    expect(backup.data.notification_log).toBeUndefined();
  });
});
