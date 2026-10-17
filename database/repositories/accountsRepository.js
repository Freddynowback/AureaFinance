import { BALANCE_SQL } from '../../services/transactions/rules';

const SELECT = `SELECT a.*, ${BALANCE_SQL} AS balance FROM accounts a`;

export const accountsRepository = {
  list(db, { includeArchived = false } = {}) {
    return db.all(
      `${SELECT} ${includeArchived ? '' : "WHERE a.status = 'active'"} ORDER BY a.status, a.sort_order, a.created_at`,
    );
  },

  get(db, id) {
    return db.get(`${SELECT} WHERE a.id = ?`, [id]);
  },

  insert(db, a) {
    return db.run(
      `INSERT INTO accounts (id, name, type, institution, currency, initial_balance, initial_balance_date,
         credit_limit, statement_day, payment_due_day, color, status, include_in_liquid, sort_order, notes,
         created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        a.id, a.name, a.type, a.institution, a.currency, a.initial_balance, a.initial_balance_date,
        a.credit_limit, a.statement_day, a.payment_due_day, a.color, a.status || 'active',
        a.include_in_liquid ? 1 : 0, a.sort_order || 0, a.notes, a.created_at, a.updated_at,
      ],
    );
  },

  update(db, a) {
    return db.run(
      `UPDATE accounts SET name = ?, institution = ?, currency = ?, initial_balance = ?, initial_balance_date = ?,
         credit_limit = ?, statement_day = ?, payment_due_day = ?, color = ?, status = ?, include_in_liquid = ?,
         notes = ?, updated_at = ?
       WHERE id = ?`,
      [
        a.name, a.institution, a.currency, a.initial_balance, a.initial_balance_date, a.credit_limit,
        a.statement_day, a.payment_due_day, a.color, a.status, a.include_in_liquid ? 1 : 0, a.notes,
        a.updated_at, a.id,
      ],
    );
  },

  async countMovements(db, id) {
    const row = await db.get(
      'SELECT COUNT(*) AS n FROM transactions WHERE account_id = ? OR to_account_id = ?',
      [id, id],
    );
    return row.n;
  },

  delete(db, id) {
    return db.run('DELETE FROM accounts WHERE id = ?', [id]);
  },
};
