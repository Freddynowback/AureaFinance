import { useCallback, useMemo } from 'react';
import { getSettings, periodSettingsFrom, setSettings } from '../services/settings/settingsService';
import { useDb } from './DatabaseProvider';
import { useQuery } from './useQuery';

/**
 * Preferencias de la app. `periodSettings` se memoriza: su identidad solo
 * cambia cuando cambian las preferencias (es seguro usarlo como dependencia).
 */
export function useSettings() {
  const db = useDb();
  const { data, loading } = useQuery(getSettings, []);
  const update = useCallback(values => setSettings(db, values), [db]);
  const periodSettings = useMemo(() => (data ? periodSettingsFrom(data) : null), [data]);
  return { settings: data, loading, update, periodSettings };
}
