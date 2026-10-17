export const budgetsRepository = {
  list(db, { activeOnly = true } = {}) {
    return db.all(
      `SELECT b.*, c.name AS category_name, c.color AS category_color, c.icon AS category_icon
       FROM budgets b LEFT JOIN categories c ON c.id = b.category_id
       ${activeOnly ? 'WHERE b.active = 1' : ''}
       ORDER BY CASE WHEN b.category_id IS NULL THEN 0 ELSE 1 END, c.name`,
    );
  },
  get(db, id) {
    return db.get('SELECT * FROM budgets WHERE id = ?', [id]);
  },
  findGeneral(db, periodType) {
    return db.get('SELECT * FROM budgets WHERE category_id IS NULL AND period_type = ? AND active = 1', [periodType]);
  },
  insert(db, b) {
    return db.run(
      `INSERT INTO budgets (id, category_id, period_type, amount, thresholds, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [b.id, b.category_id, b.period_type, b.amount, b.thresholds, b.active ? 1 : 0, b.created_at, b.updated_at],
    );
  },
  update(db, b) {
    return db.run(
      'UPDATE budgets SET category_id = ?, period_type = ?, amount = ?, thresholds = ?, active = ?, updated_at = ? WHERE id = ?',
      [b.category_id, b.period_type, b.amount, b.thresholds, b.active ? 1 : 0, b.updated_at, b.id],
    );
  },
  delete(db, id) {
    return db.run('DELETE FROM budgets WHERE id = ?', [id]);
  },
};
