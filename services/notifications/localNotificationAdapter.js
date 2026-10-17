/**
 * Adaptador de notificaciones locales (react-native-notify-kit, fork mantenido
 * de Notifee). No requiere Firebase ni conexión. Usa disparadores inexactos
 * (WorkManager): no se necesita el permiso de alarmas exactas.
 */
import notifee, { AndroidImportance, AuthorizationStatus, RepeatFrequency, TriggerType } from 'react-native-notify-kit';

const CHANNEL = 'aurea-finance';
const PREFIX = 'aurea:';

async function ensureChannel() {
  return notifee.createChannel({ id: CHANNEL, name: 'Avisos financieros', importance: AndroidImportance.DEFAULT, sound: undefined, vibration: false });
}

export const localNotificationAdapter = {
  async requestPermission() {
    const s = await notifee.requestPermission();
    return s.authorizationStatus >= AuthorizationStatus.AUTHORIZED;
  },

  async hasPermission() {
    const s = await notifee.getNotificationSettings();
    return s.authorizationStatus >= AuthorizationStatus.AUTHORIZED;
  },

  /** Reemplaza todas las programadas de la app por `items` (idempotente). */
  async replaceScheduled(items) {
    await ensureChannel();
    const existing = (await notifee.getTriggerNotificationIds()).filter(id => id.startsWith(PREFIX));
    const wanted = new Set(items.map(i => PREFIX + i.id));
    const stale = existing.filter(id => !wanted.has(id));
    if (stale.length) await notifee.cancelTriggerNotifications(stale);
    for (const item of items) {
      await notifee.createTriggerNotification(
        { id: PREFIX + item.id, title: item.title, body: item.body, android: { channelId: CHANNEL, pressAction: { id: 'default' }, smallIcon: 'ic_launcher' } },
        {
          type: TriggerType.TIMESTAMP,
          timestamp: item.timestamp,
          repeatFrequency: item.repeatDaily ? RepeatFrequency.DAILY : undefined,
        },
      );
    }
    return items.length;
  },

  async showNow(item) {
    await ensureChannel();
    await notifee.displayNotification({
      id: PREFIX + item.key,
      title: item.title,
      body: item.body,
      android: { channelId: CHANNEL, pressAction: { id: 'default' }, smallIcon: 'ic_launcher' },
    });
  },

  async cancelAll() {
    const ids = (await notifee.getTriggerNotificationIds()).filter(id => id.startsWith(PREFIX));
    if (ids.length) await notifee.cancelTriggerNotifications(ids);
  },
};
