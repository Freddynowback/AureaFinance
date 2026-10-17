/**
 * Datos iniciales imprescindibles: categorías predefinidas y preferencias.
 * NO se crean cuentas, gastos, ingresos ni deudas: la primera ejecución
 * empieza limpia y el usuario introduce sus propios datos.
 */
import { DEFAULT_CATEGORIES } from '../config/categories';
import { DEFAULT_SETTINGS } from '../config/defaultSettings';
import { nowDateTime } from '../utils/dates';
import { uuid } from '../utils/id';

export async function seedDefaults(db) {
  const seeded = await db.get("SELECT value FROM settings WHERE key = 'seed.categories'");
  await db.transaction(async tx => {
    if (!seeded) {
      const now = nowDateTime();
      let order = 0;
      for (const c of DEFAULT_CATEGORIES) {
        await tx.run(
          `INSERT INTO categories (id, name, color, icon, kind, status, is_system, sort_order, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'active', 1, ?, ?, ?)`,
          [uuid(), c.name, c.color, c.icon, c.kind, order++, now, now],
        );
      }
      await tx.run("INSERT INTO settings(key, value) VALUES ('seed.categories', '1')");
    }
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      await tx.run('INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)', [key, JSON.stringify(value)]);
    }
  });
}
