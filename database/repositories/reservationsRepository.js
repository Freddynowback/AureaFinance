export const reservationsRepository = {
  insert(db, r) {
    return db.run(
      `INSERT INTO reservations (id, target_type, target_id, amount, account_id, transaction_id, occurred_at, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [r.id, r.target_type, r.target_id, r.amount, r.account_id, r.transaction_id, r.occurred_at, r.note, r.created_at],
    );
  },

  async total(db, targetType, targetId) {
    const row = await db.get(
      'SELECT COALESCE(SUM(amount), 0) AS total FROM reservations WHERE target_type = ? AND target_id = ?',
      [targetType, targetId],
    );
    return row.total;
  },

  list(db, targetType, targetId) {
    return db.all(
      `SELECT r.*, a.name AS account_name FROM reservations r LEFT JOIN accounts a ON a.id = r.account_id
       WHERE r.target_type = ? AND r.target_id = ? ORDER BY r.occurred_at DESC, r.created_at DESC`,
      [targetType, targetId],
    );
  },

  /**
   * Total apartado que sale del dinero líquido: reservas virtuales sin cuenta
   * o con cuenta líquida, de deudas activas y metas activas.
   */
  async totalAgainstLiquid(db) {
    const row = await db.get(
      `SELECT COALESCE(SUM(r.amount), 0) AS total
       FROM reservations r
       LEFT JOIN accounts a ON a.id = r.account_id
       LEFT JOIN debts d ON r.target_type = 'debt' AND d.id = r.target_id
       LEFT JOIN goals g ON r.target_type = 'goal' AND g.id = r.target_id
       WHERE (r.account_id IS NULL OR (a.type <> 'credit' AND a.status = 'active' AND a.include_in_liquid = 1))
         AND ((r.target_type = 'debt' AND d.status = 'active') OR (r.target_type = 'goal' AND g.status <> 'archived'))`,
    );
    return row.total;
  },

  deleteForTarget(db, targetType, targetId) {
    return db.run('DELETE FROM reservations WHERE target_type = ? AND target_id = ?', [targetType, targetId]);
  },
};
