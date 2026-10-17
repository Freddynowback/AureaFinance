export const categoriesRepository = {
  list(db, { includeArchived = false, kind } = {}) {
    const where = [];
    const params = [];
    if (!includeArchived) where.push("status = 'active'");
    if (kind) {
      where.push("(kind = ? OR kind = 'both')");
      params.push(kind);
    }
    return db.all(
      `SELECT * FROM categories ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY status, sort_order, name`,
      params,
    );
  },

  get(db, id) {
    return db.get('SELECT * FROM categories WHERE id = ?', [id]);
  },

  findByName(db, name) {
    return db.get('SELECT * FROM categories WHERE lower(name) = lower(?)', [name.trim()]);
  },

  insert(db, c) {
    return db.run(
      `INSERT INTO categories (id, name, color, icon, kind, status, is_system, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      [c.id, c.name, c.color, c.icon, c.kind, c.status || 'active', c.sort_order || 100, c.created_at, c.updated_at],
    );
  },

  update(db, c) {
    return db.run(
      'UPDATE categories SET name = ?, color = ?, icon = ?, kind = ?, status = ?, updated_at = ? WHERE id = ?',
      [c.name, c.color, c.icon, c.kind, c.status, c.updated_at, c.id],
    );
  },

  async usage(db, id) {
    const tx = await db.get('SELECT COUNT(*) AS n FROM transactions WHERE category_id = ?', [id]);
    const rec = await db.get('SELECT COUNT(*) AS n FROM recurring_rules WHERE category_id = ?', [id]);
    const bud = await db.get('SELECT COUNT(*) AS n FROM budgets WHERE category_id = ?', [id]);
    return { transactions: tx.n, recurring: rec.n, budgets: bud.n };
  },

  delete(db, id) {
    return db.run('DELETE FROM categories WHERE id = ?', [id]);
  },
};
