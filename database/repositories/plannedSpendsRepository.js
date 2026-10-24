export const plannedSpendsRepository = {
  list(db, { from, to } = {}) {
    const where = [];
    const params = [];
    if (from) {
      where.push('planned_date >= ?');
      params.push(from);
    }
    if (to) {
      where.push('planned_date < ?');
      params.push(to);
    }
    return db.all(
      `SELECT * FROM planned_spends ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY planned_date, created_at`,
      params,
    );
  },
  insert(db, p) {
    return db.run(
      'INSERT INTO planned_spends (id, planned_date, amount, note, created_at) VALUES (?, ?, ?, ?, ?)',
      [p.id, p.planned_date, p.amount, p.note, p.created_at],
    );
  },
  delete(db, id) {
    return db.run('DELETE FROM planned_spends WHERE id = ?', [id]);
  },
};
