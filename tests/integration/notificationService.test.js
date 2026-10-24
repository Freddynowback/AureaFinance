import { openTestDb, categoryId, makeAccount } from '../helpers/testDb';
import { setSettings } from '../../services/settings/settingsService';
import { createBudget } from '../../services/budgets/budgetService';
import { createTransaction } from '../../services/transactions/transactionService';
import { todayISO } from '../../utils/dates';
import {
  checkImmediateAlerts,
  refreshScheduledNotifications,
  setNotificationAdapter,
} from '../../services/notifications/notificationService';

describe('notificationService integration', () => {
  let db;
  let adapter;

  beforeEach(async () => {
    db = await openTestDb();
    adapter = {
      hasPermission: jest.fn().mockResolvedValue(true),
      replaceScheduled: jest.fn().mockResolvedValue(0),
      showNow: jest.fn().mockResolvedValue(undefined),
      cancelAll: jest.fn().mockResolvedValue(undefined),
    };
    setNotificationAdapter(adapter);
  });
  afterEach(() => db.close());

  test('notifications.enabled=false llama cancelAll', async () => {
    await setSettings(db, { 'notifications.enabled': false });
    await expect(refreshScheduledNotifications(db)).resolves.toBe(0);
    expect(adapter.cancelAll).toHaveBeenCalledTimes(1);
    expect(adapter.hasPermission).not.toHaveBeenCalled();
  });

  test('sin permiso no programa notificaciones', async () => {
    adapter.hasPermission.mockResolvedValue(false);
    await setSettings(db, { 'notifications.enabled': true });
    await expect(refreshScheduledNotifications(db)).resolves.toBe(0);
    expect(adapter.replaceScheduled).not.toHaveBeenCalled();
  });

  test('checkImmediateAlerts muestra cada alerta una sola vez', async () => {
    const account = await makeAccount(db);
    const category = await categoryId(db, 'Alimentación');
    await setSettings(db, {
      'notifications.enabled': true,
      'notifications.budget': true,
      'notifications.lowRemaining': false,
    });
    await createBudget(db, {
      category_id: category,
      period_type: 'weekly',
      amount: 10000,
      thresholds: '100',
    });
    await createTransaction(db, {
      kind: 'expense',
      amount: 12000,
      account_id: account.id,
      category_id: category,
      payment_method: 'debit',
      // Hoy: el presupuesto semanal se evalúa sobre el periodo actual.
      occurred_at: `${todayISO()} 00:00:01`,
    });

    const first = await checkImmediateAlerts(db);
    const second = await checkImmediateAlerts(db);
    expect(first).toHaveLength(1);
    expect(first[0].title).toMatch(/Presupuesto superado/);
    expect(second).toEqual([]);
    expect(adapter.showNow).toHaveBeenCalledTimes(1);
    expect((await db.get('SELECT COUNT(*) AS n FROM notification_log')).n).toBe(1);
  });
});
