/**
 * Sincronización futura (Supabase). La app funciona 100 % sin ella.
 *
 * Los cambios locales quedan en `change_log` (triggers SQL). Un adaptador
 * real deberá:
 *  1. Autenticar al usuario (Supabase Auth) y aislar datos por user_id (RLS,
 *     ver docs/supabase/schema.sql).
 *  2. Enviar cambios pendientes y marcar `synced_at` SOLO tras confirmación
 *     del servidor (respuesta 2xx con las filas aplicadas).
 *  3. Resolver conflictos por `updated_at` (última escritura gana) y registrar
 *     los conflictos para revisión.
 *  4. Usar únicamente la clave pública (anon) + sesión del usuario; jamás la
 *     service_role en la app móvil.
 */
export const disabledSyncAdapter = {
  name: 'local',
  isConfigured: () => false,
  async pendingChanges(db) {
    const row = await db.get('SELECT COUNT(*) AS n FROM change_log WHERE synced_at IS NULL');
    return row.n;
  },
  async sync() {
    return { ok: false, reason: 'La sincronización no está configurada; los datos se guardan solo en este dispositivo.' };
  },
};

/** Marca cambios como sincronizados SOLO con la lista confirmada por el servidor. */
export async function markSynced(db, confirmedSeqs, at) {
  if (!confirmedSeqs.length) return 0;
  const res = await db.run(
    `UPDATE change_log SET synced_at = ? WHERE seq IN (${confirmedSeqs.map(() => '?').join(',')}) AND synced_at IS NULL`,
    [at, ...confirmedSeqs],
  );
  return res.changes;
}

export const getSyncAdapter = () => disabledSyncAdapter;
