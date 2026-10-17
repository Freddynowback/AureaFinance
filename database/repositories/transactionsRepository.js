/**
 * Acceso a la tabla de movimientos. Las consultas de búsqueda se construyen
 * con parámetros (nunca concatenando texto del usuario).
 */
const COLUMNS = [
  'id', 'kind', 'amount', 'currency', 'account_id', 'to_account_id', 'category_id', 'payment_method',
  'income_type', 'source', 'description', 'tags', 'occurred_at', 'debt_id', 'related_transaction_id',
  'recurring_occurrence_id', 'origin', 'external_id', 'import_batch_id', 'created_at', 'updated_at',
];

const DETAIL_SELECT = `
  SELECT t.*, c.name AS category_name, c.color AS category_color, c.icon AS category_icon,
         c.status AS category_status,
         a.name AS account_name, a.type AS account_type,
         ta.name AS to_account_name, ta.type AS to_account_type,
         d.name AS debt_name
  FROM transactions t
  LEFT JOIN categories c ON c.id = t.category_id
  LEFT JOIN accounts a ON a.id = t.account_id
  LEFT JOIN accounts ta ON ta.id = t.to_account_id
  LEFT JOIN debts d ON d.id = t.debt_id`;

export function buildSearch(filters = {}) {
  const where = [];
  const params = [];
  if (filters.text) {
    where.push("(t.description LIKE ? ESCAPE '\\' OR t.source LIKE ? ESCAPE '\\' OR t.tags LIKE ? ESCAPE '\\')");
    const like = '%' + String(filters.text).replace(/[\\%_]/g, m => '\\' + m) + '%';
    params.push(like, like, like);
  }
  if (filters.kinds && filters.kinds.length) {
    where.push(`t.kind IN (${filters.kinds.map(() => '?').join(',')})`);
    params.push(...filters.kinds);
  }
  if (filters.categoryIds && filters.categoryIds.length) {
    where.push(`t.category_id IN (${filters.categoryIds.map(() => '?').join(',')})`);
    params.push(...filters.categoryIds);
  }
  if (filters.accountId) {
    where.push('(t.account_id = ? OR t.to_account_id = ?)');
    params.push(filters.accountId, filters.accountId);
  }
  if (filters.paymentMethod) {
    where.push('t.payment_method = ?');
    params.push(filters.paymentMethod);
  }
  if (filters.from) {
    where.push('t.occurred_at >= ?');
    params.push(filters.from);
  }
  if (filters.to) {
    // `to` es exclusivo ('YYYY-MM-DD' del día siguiente)
    where.push('t.occurred_at < ?');
    params.push(filters.to);
  }
  if (Number.isInteger(filters.minAmount)) {
    where.push('ABS(t.amount) >= ?');
    params.push(filters.minAmount);
  }
  if (Number.isInteger(filters.maxAmount)) {
    where.push('ABS(t.amount) <= ?');
    params.push(filters.maxAmount);
  }
  if (filters.debtId) {
    where.push('t.debt_id = ?');
    params.push(filters.debtId);
  }
  return { where: where.length ? 'WHERE ' + where.join(' AND ') : '', params };
}

export const transactionsRepository = {
  COLUMNS,

  insert(db, t) {
    return db.run(
      `INSERT INTO transactions (${COLUMNS.join(', ')}) VALUES (${COLUMNS.map(() => '?').join(', ')})`,
      COLUMNS.map(c => (t[c] === undefined ? null : t[c])),
    );
  },

  update(db, t) {
    const cols = COLUMNS.filter(c => c !== 'id' && c !== 'created_at');
    return db.run(
      `UPDATE transactions SET ${cols.map(c => `${c} = ?`).join(', ')} WHERE id = ?`,
      [...cols.map(c => (t[c] === undefined ? null : t[c])), t.id],
    );
  },

  delete(db, id) {
    return db.run('DELETE FROM transactions WHERE id = ?', [id]);
  },

  get(db, id) {
    return db.get('SELECT * FROM transactions WHERE id = ?', [id]);
  },

  getDetailed(db, id) {
    return db.get(`${DETAIL_SELECT} WHERE t.id = ?`, [id]);
  },

  search(db, filters = {}, { limit = 50, offset = 0 } = {}) {
    const { where, params } = buildSearch(filters);
    return db.all(`${DETAIL_SELECT} ${where} ORDER BY t.occurred_at DESC, t.created_at DESC LIMIT ? OFFSET ?`, [
      ...params,
      limit,
      offset,
    ]);
  },

  async count(db, filters = {}) {
    const { where, params } = buildSearch(filters);
    const row = await db.get(`SELECT COUNT(*) AS n FROM transactions t ${where}`, params);
    return row.n;
  },

  /** Gasto neto por categoría (gastos - devoluciones) en [from, to). */
  spendingByCategory(db, from, to, { accountId } = {}) {
    const extra = accountId ? 'AND t.account_id = ?' : '';
    const params = accountId ? [from, to, accountId] : [from, to];
    return db.all(
      `SELECT t.category_id, c.name, c.color, c.icon, c.status,
              SUM(CASE WHEN t.kind = 'expense' THEN t.amount ELSE 0 END) AS gross,
              SUM(CASE WHEN t.kind = 'refund' THEN t.amount ELSE 0 END) AS refunds,
              COUNT(CASE WHEN t.kind = 'expense' THEN 1 END) AS count
       FROM transactions t
       JOIN categories c ON c.id = t.category_id
       WHERE t.kind IN ('expense','refund') AND t.occurred_at >= ? AND t.occurred_at < ? ${extra}
       GROUP BY t.category_id`,
      params,
    );
  },

  async totals(db, from, to) {
    const row = await db.get(
      `SELECT
         COALESCE(SUM(CASE WHEN kind = 'expense' THEN amount END), 0) AS expenses,
         COALESCE(SUM(CASE WHEN kind = 'refund' THEN amount END), 0) AS refunds,
         COALESCE(SUM(CASE WHEN kind = 'income' THEN amount END), 0) AS income,
         COALESCE(SUM(CASE WHEN kind = 'card_payment' THEN amount END), 0) AS card_payments,
         COUNT(*) AS count
       FROM transactions WHERE occurred_at >= ? AND occurred_at < ?`,
      [from, to],
    );
    return { ...row, net_spending: row.expenses - row.refunds };
  },

  /** Serie de gasto neto e ingresos agrupada por día ('day'), mes ('month'). */
  series(db, from, to, bucket = 'day') {
    const key = bucket === 'month' ? 'substr(occurred_at, 1, 7)' : 'substr(occurred_at, 1, 10)';
    return db.all(
      `SELECT ${key} AS bucket,
         COALESCE(SUM(CASE WHEN kind = 'expense' THEN amount WHEN kind = 'refund' THEN -amount END), 0) AS spending,
         COALESCE(SUM(CASE WHEN kind = 'income' THEN amount END), 0) AS income
       FROM transactions WHERE occurred_at >= ? AND occurred_at < ?
       GROUP BY bucket ORDER BY bucket`,
      [from, to],
    );
  },

  /** Candidatos a duplicado: misma cuenta, mismo importe y fecha cercana. */
  findSimilar(db, { accountId, amount, kind, from, to }) {
    return db.all(
      `SELECT id, kind, amount, description, occurred_at, external_id FROM transactions
       WHERE account_id = ? AND amount = ? AND kind = ? AND occurred_at >= ? AND occurred_at < ?`,
      [accountId, amount, kind, from, to],
    );
  },

  findLatestSameExpense(db, { category_id, account_id, amount, description }) {
    return db.get(
      `SELECT id FROM transactions WHERE kind = 'expense' AND category_id = ? AND account_id = ? AND amount = ?
       AND COALESCE(description, '') = ? ORDER BY occurred_at DESC LIMIT 1`,
      [category_id, account_id, amount, description || ''],
    );
  },

  findByExternalId(db, accountId, externalId) {
    return db.get('SELECT id FROM transactions WHERE account_id = ? AND external_id = ?', [accountId, externalId]);
  },
};
