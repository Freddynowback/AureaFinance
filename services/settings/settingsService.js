import { settingsRepository } from '../../database/repositories/settingsRepository';
import { DEFAULT_PERIOD_SETTINGS } from '../../utils/periods';

export const getSettings = db => settingsRepository.getAll(db);
export const setSetting = (db, key, value) => settingsRepository.set(db, key, value);
export const setSettings = (db, values) => settingsRepository.setMany(db, values);

/** Extrae la configuración de periodo desde el mapa de preferencias. */
export function periodSettingsFrom(settings, overrideType) {
  return {
    ...DEFAULT_PERIOD_SETTINGS,
    type: overrideType || settings['period.type'] || 'weekly',
    weekStartDay: settings['period.weekStartDay'] ?? 1,
    biweeklyMode: settings['period.biweeklyMode'] || 'calendar',
    biweeklyAnchor: settings['period.biweeklyAnchor'] || null,
    monthStartDay: settings['period.monthStartDay'] || 1,
    customStart: settings['period.customStart'] || null,
    customEnd: settings['period.customEnd'] || null,
  };
}
