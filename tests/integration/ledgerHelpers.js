import os from 'node:os';
import path from 'node:path';
import { Database } from '../../database/Database';
import { migrate } from '../../database/migrations';
import { seedDefaults } from '../../database/seed';
import { createNodeSqliteDriver } from '../helpers/nodeSqliteDriver';
import { createAccount } from '../../services/accounts/accountService';
import { categoriesRepository } from '../../database/repositories/categoriesRepository';

export async function openTestDatabase(file = ':memory:') {
  const db = new Database(createNodeSqliteDriver(file));
  await db.run('PRAGMA foreign_keys = ON');
  await migrate(db);
  await seedDefaults(db);
  return db;
}

export function tempDatabasePath(name = 'aurea-ledger') {
  return path.join(os.tmpdir(), `${name}-${process.pid}-${Date.now()}.sqlite`);
}

export async function createCashAccount(db, input = {}) {
  return createAccount(db, {
    name: input.name || 'Efectivo',
    type: 'cash',
    openingAmount: input.openingAmount ?? 100000,
    initial_balance_date: input.initial_balance_date || '2026-01-01',
    ...input,
  });
}

export async function createDebitAccount(db, input = {}) {
  return createAccount(db, {
    name: input.name || 'Débito',
    type: 'debit',
    openingAmount: input.openingAmount ?? 100000,
    initial_balance_date: input.initial_balance_date || '2026-01-01',
    ...input,
  });
}

export async function createCreditAccount(db, input = {}) {
  return createAccount(db, {
    name: input.name || 'Tarjeta',
    type: 'credit',
    openingAmount: input.openingAmount ?? 0,
    credit_limit: input.credit_limit ?? 100000,
    initial_balance_date: input.initial_balance_date || '2026-01-01',
    statement_day: input.statement_day ?? 15,
    payment_due_day: input.payment_due_day ?? 31,
    ...input,
  });
}

export function categoryByName(db, name) {
  return categoriesRepository.findByName(db, name);
}
