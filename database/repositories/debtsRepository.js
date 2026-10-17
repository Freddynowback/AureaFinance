/**
 * Deudas y financiaciones. El saldo pendiente se obtiene del último registro
 * de conciliación menos los pagos vinculados posteriores a esa conciliación.
 */
/*
 * Regla: el último saldo conciliado ya incluye todos los pagos registrados
 * antes de esa conciliación; solo se restan los pagos registrados después
 * (comparando created_at, que es monótono en la app).
 */
const LAST_SNAPSHOT = `(SELECT s.%s FROM debt_balance_snapshots s WHERE s.debt_id = d.id
     ORDER BY s.created_at DESC LIMIT 1)`;

const OUTSTANDING_SQL = `
  ${LAST_SNAPSHOT.replace('%s', 'balance')}
  - COALESCE((SELECT SUM(t.amount) FROM transactions t
      WHERE t.debt_id = d.id AND t.kind = 'card_payment'
        AND t.created_at > ${LAST_SNAPSHOT.replace('%s', 'created_at')}), 0)`;

const RESERVED_SQL = `COALESCE((SELECT SUM(r.amount) FROM reservations r
  WHERE r.target_type = 'debt' AND r.target_id = d.id), 0)`;

const PAID_SQL = `COALESCE((SELECT SUM(t.amount) FROM transactions t
  WHERE t.debt_id = d.id AND t.kind = 'card_payment'), 0)`;

const SELECT = `
  SELECT d.*, ${OUTSTANDING_SQL} AS outstanding, ${RESERVED_SQL} AS reserved, ${PAID_SQL} AS paid_total,
         ${LAST_SNAPSHOT.replace('%s', 'recorded_at')} AS balance_updated_at,
         ${LAST_SNAPSHOT.replace('%s', 'created_at')} AS balance_snapshot_created_at,
         a.name AS account_name
  FROM debts d LEFT JOIN accounts a ON a.id = d.account_id`;

export const debtsRepository = {
  list(db, { includeClosed = false } = {}) {
    return db.all(
      `${SELECT} ${includeClosed ? '' : "WHERE d.status = 'active'"}
       ORDER BY CASE WHEN d.next_due_date IS NULL THEN 1 ELSE 0 END, d.next_due_date, d.created_at`,
    );
  },

  get(db, id) {
    return db.get(`${SELECT} WHERE d.id = ?`, [id]);
  },

  insert(db, d) {
    return db.run(
      `INSERT INTO debts (id, name, account_id, financing_type, monthly_payment, next_due_date, statement_day,
         installments_remaining, interest_rate_bp, notes, status, origin_transaction_id, currency, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        d.id, d.name, d.account_id, d.financing_type, d.monthly_payment, d.next_due_date, d.statement_day,
        d.installments_remaining, d.interest_rate_bp, d.notes, d.status || 'active', d.origin_transaction_id,
        d.currency || 'MXN', d.created_at, d.updated_at,
      ],
    );
  },

  update(db, d) {
    return db.run(
      `UPDATE debts SET name = ?, account_id = ?, financing_type = ?, monthly_payment = ?, next_due_date = ?,
         statement_day = ?, installments_remaining = ?, interest_rate_bp = ?, notes = ?, status = ?, updated_at = ?
       WHERE id = ?`,
      [
        d.name, d.account_id, d.financing_type, d.monthly_payment, d.next_due_date, d.statement_day,
        d.installments_remaining, d.interest_rate_bp, d.notes, d.status, d.updated_at, d.id,
      ],
    );
  },

  delete(db, id) {
    return db.run('DELETE FROM debts WHERE id = ?', [id]);
  },

  insertSnapshot(db, s) {
    return db.run(
      `INSERT INTO debt_balance_snapshots (id, debt_id, balance, recorded_at, kind, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [s.id, s.debt_id, s.balance, s.recorded_at, s.kind, s.note, s.created_at],
    );
  },

  snapshots(db, debtId) {
    return db.all(
      'SELECT * FROM debt_balance_snapshots WHERE debt_id = ? ORDER BY recorded_at, created_at',
      [debtId],
    );
  },

  payments(db, debtId) {
    return db.all(
      `SELECT t.*, a.name AS account_name FROM transactions t LEFT JOIN accounts a ON a.id = t.account_id
       WHERE t.debt_id = ? AND t.kind = 'card_payment' ORDER BY t.occurred_at`,
      [debtId],
    );
  },
};
