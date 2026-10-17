const SELECT = `
  SELECT g.*, COALESCE((SELECT SUM(r.amount) FROM reservations r WHERE r.target_type = 'goal' AND r.target_id = g.id), 0) AS saved,
         a.name AS account_name
  FROM goals g LEFT JOIN accounts a ON a.id = g.account_id`;

export const goalsRepository = {
  list(db, { includeArchived = false } = {}) {
    return db.all(`${SELECT} ${includeArchived ? '' : "WHERE g.status <> 'archived'"} ORDER BY g.status, g.created_at`);
  },
  get(db, id) {
    return db.get(`${SELECT} WHERE g.id = ?`, [id]);
  },
  insert(db, g) {
    return db.run(
      `INSERT INTO goals (id, name, target_amount, deadline, mode, account_id, color, notes, status, currency, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [g.id, g.name, g.target_amount, g.deadline, g.mode, g.account_id, g.color, g.notes, g.status || 'active',
        g.currency || 'MXN', g.created_at, g.updated_at],
    );
  },
  update(db, g) {
    return db.run(
      `UPDATE goals SET name = ?, target_amount = ?, deadline = ?, mode = ?, account_id = ?, color = ?, notes = ?,
         status = ?, updated_at = ? WHERE id = ?`,
      [g.name, g.target_amount, g.deadline, g.mode, g.account_id, g.color, g.notes, g.status, g.updated_at, g.id],
    );
  },
  delete(db, id) {
    return db.run('DELETE FROM goals WHERE id = ?', [id]);
  },
};
