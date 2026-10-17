import { openTestDb, categoryId, makeAccount } from '../helpers/testDb';
import { createRule, syncRecurring } from '../../services/recurring/recurringService';
import { archiveAccount } from '../../services/accounts/accountService';

test('una recurrencia automática con cuenta archivada no impide arrancar la app', async () => {
  const db = await openTestDb();
  const subs = await categoryId(db, 'Suscripciones');
  const card = await makeAccount(db, { name: 'Vieja', type: 'credit', openingAmount: 0 });
  const ok = await makeAccount(db, { name: 'Nómina', openingAmount: 100000 });
  await createRule(db, { kind: 'expense', name: 'Streaming', amount: 19900, account_id: card.id, category_id: subs, payment_method: 'credit', frequency: 'monthly', start_date: '2026-10-01', auto_post: true }, '2026-09-30');
  await createRule(db, { kind: 'expense', name: 'Gym', amount: 50000, account_id: ok.id, category_id: subs, payment_method: 'debit', frequency: 'monthly', start_date: '2026-10-01', auto_post: true }, '2026-09-30');
  await archiveAccount(db, card.id, true);
  const res = await syncRecurring(db, '2026-10-17');
  // La regla válida se registra; la inválida queda pendiente y se informa.
  expect(res.posted).toBe(1);
  expect(res.failed).toHaveLength(1);
  expect(res.failed[0].name).toBe('Streaming');
  const pending = await db.get("SELECT o.status FROM recurring_occurrences o JOIN recurring_rules r ON r.id = o.rule_id WHERE r.name = 'Streaming' AND o.due_date = '2026-10-01'");
  expect(pending.status).toBe('pending');
  await db.close();
});
