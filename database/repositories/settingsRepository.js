import { DEFAULT_SETTINGS } from '../../config/defaultSettings';

function decode(value, key) {
  try {
    return JSON.parse(value);
  } catch (_) {
    return DEFAULT_SETTINGS[key];
  }
}

export const settingsRepository = {
  async getAll(db) {
    const rows = await db.all('SELECT key, value FROM settings');
    const result = { ...DEFAULT_SETTINGS };
    for (const r of rows) result[r.key] = decode(r.value, r.key);
    return result;
  },

  async get(db, key) {
    const row = await db.get('SELECT value FROM settings WHERE key = ?', [key]);
    return row ? decode(row.value, key) : DEFAULT_SETTINGS[key];
  },

  async set(db, key, value) {
    await db.run(
      'INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [key, JSON.stringify(value === undefined ? null : value)],
    );
  },

  async setMany(db, values) {
    await db.transaction(async tx => {
      for (const [k, v] of Object.entries(values)) {
        await tx.run(
          'INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
          [k, JSON.stringify(v === undefined ? null : v)],
        );
      }
    });
  },
};
