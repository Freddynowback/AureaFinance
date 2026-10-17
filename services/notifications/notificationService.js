/**
 * Orquesta las notificaciones: calcula con datos reales (planner) y entrega
 * con el adaptador local. Las alertas inmediatas se registran en
 * notification_log para no repetirse.
 */
import { getSettings, periodSettingsFrom } from '../settings/settingsService';
import { getUpcoming } from '../stats/upcomingService';
import { listBudgetStatus } from '../budgets/budgetService';
import { getPeriodSummary } from '../stats/summaryService';
import { stamp } from '../../utils/dates';
import { planImmediate, planScheduled } from './notificationPlanner';

let adapter = null;
function getAdapter() {
  if (!adapter) adapter = require('./localNotificationAdapter').localNotificationAdapter;
  return adapter;
}
export function setNotificationAdapter(a) {
  adapter = a;
}

export async function refreshScheduledNotifications(db) {
  const settings = await getSettings(db);
  const a = getAdapter();
  if (!settings['notifications.enabled']) {
    await a.cancelAll();
    return 0;
  }
  if (!(await a.hasPermission())) return 0;
  const { items } = await getUpcoming(db, { days: 31 });
  return a.replaceScheduled(planScheduled({ settings, upcoming: items }));
}

/** Llamar tras guardar/editar/borrar un movimiento. */
export async function checkImmediateAlerts(db) {
  const settings = await getSettings(db);
  if (!settings['notifications.enabled']) return [];
  const a = getAdapter();
  if (!(await a.hasPermission())) return [];
  const ps = periodSettingsFrom(settings);
  const [budgets, summary] = await Promise.all([
    listBudgetStatus(db, ps),
    getPeriodSummary(db, { periodSettings: ps, remainingMode: settings['circle.remainingBase'] }),
  ]);
  const shown = [];
  for (const alert of planImmediate({ settings, budgets, summary })) {
    const res = await db.run('INSERT OR IGNORE INTO notification_log(key, created_at) VALUES (?, ?)', [alert.key, stamp()]);
    if (res.changes) {
      await a.showNow(alert);
      shown.push(alert);
    }
  }
  return shown;
}

/**
 * Ejecuta una actualización de avisos sin bloquear el guardado. Si falla, se
 * informa (el dato ya se guardó) en lugar de ocultar el error.
 */
export function notifySafely(promise, toast) {
  return Promise.resolve(promise).catch(() => {
    if (toast) toast('Guardado. No se pudieron actualizar los avisos; revisa el permiso de notificaciones.', 'warning');
  });
}
