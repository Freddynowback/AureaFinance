/**
 * Driver de pruebas: SQLite real de Node (node:sqlite), sin mocks.
 */
const { DatabaseSync } = require('node:sqlite');

function createNodeSqliteDriver(path = ':memory:') {
  const db = new DatabaseSync(path);
  return {
    async execute(sql, params = []) {
      const stmt = db.prepare(sql);
      const returnsRows = stmt.columns().length > 0;
      if (returnsRows) {
        const rows = stmt.all(...params).map(r => ({ ...r }));
        return { rows, changes: 0 };
      }
      const info = stmt.run(...params);
      return { rows: [], changes: Number(info.changes) };
    },
    async close() {
      db.close();
    },
  };
}

module.exports = { createNodeSqliteDriver };
