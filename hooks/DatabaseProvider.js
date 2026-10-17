import React, { createContext, useContext, useEffect, useState } from 'react';
import { initDatabase } from '../database/connection';
import { syncRecurring } from '../services/recurring/recurringService';

const DbContext = createContext(null);

/**
 * Abre SQLite, aplica migraciones y sincroniza recurrencias (idempotente)
 * antes de mostrar la app. Si falla, muestra el error en lugar de datos falsos.
 */
export function DatabaseProvider({ children, fallback, renderError }) {
  const [db, setDb] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const instance = await initDatabase();
        // Las recurrencias nunca deben impedir abrir la app.
        await syncRecurring(instance).catch(() => {});
        if (alive) setDb(instance);
      } catch (e) {
        if (alive) setError(e);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  if (error) return renderError ? renderError(error) : null;
  if (!db) return fallback || null;
  return <DbContext.Provider value={db}>{children}</DbContext.Provider>;
}

export function useDb() {
  const db = useContext(DbContext);
  if (!db) throw new Error('useDb debe usarse dentro de DatabaseProvider');
  return db;
}
