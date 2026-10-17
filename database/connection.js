/**
 * Conexión única a la base de datos de la app.
 */
import { Database } from './Database';
import { migrate } from './migrations';
import { seedDefaults } from './seed';

let instance = null;
let opening = null;

export async function initDatabase(driverFactory) {
  if (instance) return instance;
  if (!opening) {
    opening = (async () => {
      const factory =
        driverFactory || require('./drivers/opSqliteDriver').createOpSqliteDriver;
      const db = new Database(factory());
      await db.run('PRAGMA foreign_keys = ON');
      await db.all('PRAGMA journal_mode = WAL');
      await migrate(db);
      await seedDefaults(db);
      instance = db;
      return db;
    })();
  }
  try {
    return await opening;
  } finally {
    opening = null;
  }
}

export function getDatabase() {
  if (!instance) throw new Error('La base de datos aún no está inicializada');
  return instance;
}

export async function closeDatabase() {
  if (instance) {
    await instance.close();
    instance = null;
  }
}
