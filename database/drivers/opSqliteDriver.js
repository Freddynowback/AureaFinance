/**
 * Driver de producción sobre @op-engineering/op-sqlite (JSI, nueva arquitectura).
 * El archivo vive en el almacenamiento privado de la app: no requiere permisos.
 */
import { open } from '@op-engineering/op-sqlite';

export function createOpSqliteDriver(name = 'aurea.sqlite') {
  const db = open({ name });
  return {
    async execute(sql, params) {
      const res = params && params.length ? await db.execute(sql, params) : await db.execute(sql);
      return { rows: res.rows || [], changes: res.rowsAffected || 0 };
    },
    async close() {
      db.close();
    },
    path() {
      return db.getDbPath();
    },
  };
}
