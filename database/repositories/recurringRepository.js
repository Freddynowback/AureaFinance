export const recurringRepository = {
  listRules(db, { kind } = {}) {
    return db.all(
      `SELECT r.*, a.name AS account_name, c.name AS category_name, c.color AS category_color, c.icon AS category_icon
       FROM recurring_rules r
       LEFT JOIN accounts a ON a.id = r.account_id
       LEFT JOIN categories c ON c.id = r.category_id
       ${kind ? 'WHERE r.kind = ?' : ''}
       ORDER BY r.status, r.name`,
      kind ? [kind] : [],
    );
  },
  getRule(db, id) {
    return db.get('SELECT * FROM recurring_rules WHERE id = ?', [id]);
  },
  insertRule(db, r) {
    return db.run(
      `INSERT INTO recurring_rules (id, kind, name, amount, account_id, category_id, payment_method, income_type,
         frequency, interval_days, start_date, end_date, auto_post, status, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [r.id, r.kind, r.name, r.amount, r.account_id, r.category_id, r.payment_method, r.income_type, r.frequency,
        r.interval_days, r.start_date, r.end_date, r.auto_post ? 1 : 0, r.status || 'active', r.notes,
        r.created_at, r.updated_at],
    );
  },
  updateRule(db, r) {
    return db.run(
      `UPDATE recurring_rules SET name = ?, amount = ?, account_id = ?, category_id = ?, payment_method = ?,
         income_type = ?, frequency = ?, interval_days = ?, start_date = ?, end_date = ?, auto_post = ?, status = ?,
         notes = ?, updated_at = ? WHERE id = ?`,
      [r.name, r.amount, r.account_id, r.category_id, r.payment_method, r.income_type, r.frequency, r.interval_days,
        r.start_date, r.end_date, r.auto_post ? 1 : 0, r.status, r.notes, r.updated_at, r.id],
    );
  },
  deleteRule(db, id) {
    return db.run('DELETE FROM recurring_rules WHERE id = ?', [id]);
  },
  lastOccurrenceDate(db, ruleId) {
    return db.get('SELECT MAX(due_date) AS d FROM recurring_occurrences WHERE rule_id = ?', [ruleId]);
  },
  insertOccurrenceIfMissing(db, o) {
    return db.run(
      `INSERT OR IGNORE INTO recurring_occurrences (id, rule_id, due_date, amount, status, created_at)
       VALUES (?, ?, ?, ?, 'pending', ?)`,
      [o.id, o.rule_id, o.due_date, o.amount, o.created_at],
    );
  },
  getOccurrence(db, id) {
    return db.get('SELECT * FROM recurring_occurrences WHERE id = ?', [id]);
  },
  setOccurrenceStatus(db, id, status, transactionId = null) {
    return db.run('UPDATE recurring_occurrences SET status = ?, transaction_id = ? WHERE id = ?', [
      status,
      transactionId,
      id,
    ]);
  },
  deletePendingFrom(db, ruleId, fromDate) {
    return db.run(
      "DELETE FROM recurring_occurrences WHERE rule_id = ? AND status = 'pending' AND due_date >= ?",
      [ruleId, fromDate],
    );
  },
  /** Ocurrencias (pendientes por defecto) con datos de la regla en [from, to]. */
  occurrences(db, { from, to, status = 'pending', kind } = {}) {
    const where = ["r.status = 'active'"];
    const params = [];
    if (status) {
      where.push('o.status = ?');
      params.push(status);
    }
    if (from) {
      where.push('o.due_date >= ?');
      params.push(from);
    }
    if (to) {
      where.push('o.due_date <= ?');
      params.push(to);
    }
    if (kind) {
      where.push('r.kind = ?');
      params.push(kind);
    }
    return db.all(
      `SELECT o.*, r.kind, r.name, r.account_id, r.category_id, r.payment_method, r.income_type, r.auto_post,
              a.name AS account_name, c.name AS category_name, c.color AS category_color, c.icon AS category_icon
       FROM recurring_occurrences o
       JOIN recurring_rules r ON r.id = o.rule_id
       LEFT JOIN accounts a ON a.id = r.account_id
       LEFT JOIN categories c ON c.id = r.category_id
       WHERE ${where.join(' AND ')}
       ORDER BY o.due_date, r.name`,
      params,
    );
  },
};
