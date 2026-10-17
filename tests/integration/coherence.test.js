import { openTestDb, categoryId, makeAccount } from '../helpers/testDb';
import { getAccountsOverview } from '../../services/accounts/accountService';
import { createTransaction } from '../../services/transactions/transactionService';
import { getPeriodSummary } from '../../services/stats/summaryService';

const periodSettings = { type: 'weekly', weekStartDay: 1, biweeklyMode: 'calendar', monthStartDay: 1 };
const ref = '2026-10-15';
const at = day => `${day} 12:00:00`;

let db;
let category;
let debit;
let cash;
let nu;
let oro;
let departmental;

async function state() {
  const overview = await getAccountsOverview(db, ref);
  const summary = await getPeriodSummary(db, { periodSettings, ref });
  const cards = Object.fromEntries(
    overview.accounts
      .filter(account => account.type === 'credit')
      .map(account => [account.name, account.credit]),
  );
  return { overview, summary, cards };
}

function expectCards(cards, expected) {
  for (const [name, values] of Object.entries(expected)) {
    expect(cards[name]).toMatchObject(values);
  }
}

async function expectState({ spent, liquid, available, cards }) {
  const current = await state();
  expect(current.summary.spent).toBe(spent);
  expect(current.overview.liquid).toBe(liquid);
  expect(current.overview.available).toBe(available);
  expectCards(current.cards, cards);
  return current;
}

beforeEach(async () => {
  db = await openTestDb();
  category = await categoryId(db, 'Compras');
  debit = await makeAccount(db, {
    name: 'Débito',
    type: 'debit',
    openingAmount: 1000000,
    initial_balance_date: '2026-10-01',
  });
  cash = await makeAccount(db, {
    name: 'Efectivo',
    type: 'cash',
    openingAmount: 100000,
    initial_balance_date: '2026-10-01',
  });
  nu = await makeAccount(db, {
    name: 'NU',
    type: 'credit',
    openingAmount: 100000,
    credit_limit: 400000,
    initial_balance_date: '2026-10-01',
  });
  oro = await makeAccount(db, {
    name: 'Oro',
    type: 'credit',
    openingAmount: 500000,
    credit_limit: 2000000,
    initial_balance_date: '2026-10-01',
  });
  departmental = await makeAccount(db, {
    name: 'Departamental',
    type: 'credit',
    openingAmount: 30000,
    initial_balance_date: '2026-10-01',
  });
});

afterEach(() => db.close());

test('coherencia financiera de una semana completa, en centavos', async () => {
  // La compra previa cuenta en la deuda, pero queda fuera del periodo semanal.
  const previousWeek = await createTransaction(db, {
    kind: 'expense', amount: 7500, account_id: nu.id, category_id: category,
    payment_method: 'credit', occurred_at: at('2026-10-08'),
  });
  await expectState({
    spent: 0, liquid: 1100000, available: 1100000,
    cards: {
      NU: { limit: 400000, used: 107500, available: 292500 },
      Oro: { limit: 2000000, used: 500000, available: 1500000 },
      Departamental: { limit: null, used: 30000, available: null },
    },
  });

  await createTransaction(db, {
    kind: 'expense', amount: 25000, account_id: debit.id, category_id: category,
    payment_method: 'debit', occurred_at: at('2026-10-12'),
  });
  await expectState({
    spent: 25000, liquid: 1075000, available: 1075000,
    cards: {
      NU: { used: 107500, available: 292500 }, Oro: { used: 500000, available: 1500000 },
      Departamental: { used: 30000, available: null },
    },
  });

  await createTransaction(db, {
    kind: 'expense', amount: 8000, account_id: cash.id, category_id: category,
    payment_method: 'cash', occurred_at: at('2026-10-13'),
  });
  await expectState({
    spent: 33000, liquid: 1067000, available: 1067000,
    cards: {
      NU: { used: 107500, available: 292500 }, Oro: { used: 500000, available: 1500000 },
      Departamental: { used: 30000, available: null },
    },
  });

  const nuPurchase = await createTransaction(db, {
    kind: 'expense', amount: 60000, account_id: nu.id, category_id: category,
    payment_method: 'credit', occurred_at: at('2026-10-14'),
  });
  await expectState({
    spent: 93000, liquid: 1067000, available: 1067000,
    cards: {
      NU: { used: 167500, available: 232500 }, Oro: { used: 500000, available: 1500000 },
      Departamental: { used: 30000, available: null },
    },
  });

  await createTransaction(db, {
    kind: 'expense', amount: 120000, account_id: oro.id, category_id: category,
    payment_method: 'credit', occurred_at: at('2026-10-15'),
  });
  await expectState({
    spent: 213000, liquid: 1067000, available: 1067000,
    cards: {
      NU: { used: 167500, available: 232500 }, Oro: { used: 620000, available: 1380000 },
      Departamental: { used: 30000, available: null },
    },
  });

  await createTransaction(db, {
    kind: 'card_payment', amount: 90000, account_id: debit.id, to_account_id: nu.id,
    occurred_at: at('2026-10-16'),
  });
  await expectState({
    spent: 213000, liquid: 977000, available: 977000,
    cards: {
      NU: { used: 77500, available: 322500 }, Oro: { used: 620000, available: 1380000 },
      Departamental: { used: 30000, available: null },
    },
  });

  await createTransaction(db, {
    kind: 'card_payment', amount: 200000, account_id: debit.id, to_account_id: oro.id,
    occurred_at: at('2026-10-16'),
  });
  await expectState({
    spent: 213000, liquid: 777000, available: 777000,
    cards: {
      NU: { used: 77500, available: 322500 }, Oro: { used: 420000, available: 1580000 },
      Departamental: { used: 30000, available: null },
    },
  });

  await createTransaction(db, {
    kind: 'refund', amount: 10000, account_id: nu.id, category_id: category,
    related_transaction_id: nuPurchase.id, occurred_at: at('2026-10-17'),
  });
  await expectState({
    spent: 203000, liquid: 777000, available: 777000,
    cards: {
      NU: { used: 67500, available: 332500 }, Oro: { used: 420000, available: 1580000 },
      Departamental: { used: 30000, available: null },
    },
  });

  await createTransaction(db, {
    kind: 'expense', amount: 5000, account_id: departmental.id, category_id: category,
    payment_method: 'credit', occurred_at: at('2026-10-18'),
  });
  const final = await expectState({
    spent: 208000, liquid: 777000, available: 777000,
    cards: {
      NU: { used: 67500, available: 332500 }, Oro: { used: 420000, available: 1580000 },
      Departamental: { limit: null, used: 35000, available: null },
    },
  });

  expect(final.overview.credit).toMatchObject({
    limit: 2400000, used: 522500, available: 1912500, cardsWithoutLimit: 1,
  });
  expect(final.overview.creditDebt).toBe(522500);
  expect(final.overview.available).toBe(final.overview.liquid);
  expect(final.summary.spent).toBe(25000 + 8000 + 60000 + 120000 + 5000 - 10000);
  expect(final.summary.cardPayments).toBe(290000);
  expect(final.summary.period).toMatchObject({ start: '2026-10-12', end: '2026-10-19' });
  expect((await getAccountsOverview(db, ref)).accounts.find(a => a.id === nu.id).credit.used).toBe(67500);
  expect(previousWeek).toBeTruthy();
});
