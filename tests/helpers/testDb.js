import { Database } from '../../database/Database';
import { migrate } from '../../database/migrations';
import { seedDefaults } from '../../database/seed';
import { createAccount } from '../../services/accounts/accountService';
const { createNodeSqliteDriver } = require('./nodeSqliteDriver');

export async function openTestDb(path = ':memory:') {
  const db = new Database(createNodeSqliteDriver(path));
  await db.run('PRAGMA foreign_keys = ON');
  await migrate(db);
  await seedDefaults(db);
  return db;
}

export async function categoryId(db, name) {
  const row = await db.get('SELECT id FROM categories WHERE name = ?', [name]);
  if (!row) throw new Error('Categoría no encontrada: ' + name);
  return row.id;
}

export function makeAccount(db, overrides = {}) {
  return createAccount(db, { name: 'Débito', type: 'debit', openingAmount: 0, initial_balance_date: '2026-01-01', ...overrides });
}
