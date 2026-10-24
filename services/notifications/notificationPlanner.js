/**
 * Calcula qué notificaciones corresponden a partir de datos reales. Es puro:
 * no conoce el sistema de notificaciones, así se puede probar y sustituir
 * (local hoy, Firebase Cloud Messaging en el futuro).
 *
 * Cada aviso tiene un `id` estable: reprogramar con el mismo id reemplaza el
 * anterior en vez de duplicarlo.
 */
import { addDays, formatDate } from '../../utils/dates';
import { formatMoney } from '../../utils/money';

const pad = n => String(n).padStart(2, '0');

function atHour(dateISO, hour) {
  const [y, m, d] = dateISO.split('-').map(Number);
  return new Date(y, m - 1, d, hour, 0, 0).getTime();
}

/** Planes de la tarjeta sin pago mensual: su parte del mes no está incluida. */
function cardMissingText(item) {
  const n = item.breakdown ? item.breakdown.plansWithoutMonthly : 0;
  return n ? `. Sin incluir ${n} ${n === 1 ? 'financiación' : 'financiaciones'} sin pago mensual registrado` : '';
}

/**
 * Notificaciones programadas a futuro.
 * upcoming: resultado de getUpcoming().items
 */
export function planScheduled({ settings, upcoming = [], now = new Date() }) {
  if (!settings['notifications.enabled']) return [];
  const daysBefore = Math.max(0, Number(settings['notifications.daysBefore'] ?? 2));
  const hour = Math.min(23, Math.max(0, Number(settings['notifications.hour'] ?? 9)));
  const nowMs = now.getTime();
  const out = [];
  const typeEnabled = {
    card_due: settings['notifications.cardDue'],
    debt_due: settings['notifications.debtDue'],
    expected_income: settings['notifications.expectedIncome'],
    recurring_expense: settings['notifications.recurringExpense'],
  };
  for (const item of upcoming) {
    if (!typeEnabled[item.type]) continue;
    const notifyDate = item.type === 'expected_income' ? item.date : addDays(item.date, -daysBefore);
    let when = atHour(notifyDate, hour);
    if (when <= nowMs) {
      // Si la fecha de aviso ya pasó pero el vencimiento no, avisar hoy más tarde.
      if (atHour(item.date, 23) <= nowMs) continue;
      when = nowMs + 60 * 60 * 1000;
    }
    const amount = item.amount ? formatMoney(item.amount) : '';
    const dateText = formatDate(item.date, { withYear: false, withWeekday: true });
    let title;
    let body;
    switch (item.type) {
      case 'card_due':
        title = `Pago de tarjeta: ${item.title.replace(/^Vence /, '')}`;
        body = `Vence el ${dateText}. A pagar: ${formatMoney(item.amount || 0)} (sin financiar + mensualidades del mes)${cardMissingText(item)}.`;
        break;
      case 'debt_due':
        title = `Pago próximo: ${item.title}`;
        body = `Vence el ${dateText}${amount ? ` · ${item.amountIsEstimate ? 'saldo pendiente' : 'pago'} ${amount}` : ''}.`;
        break;
      case 'expected_income':
        title = `Ingreso esperado: ${item.title}`;
        body = `Se espera ${amount} hoy. Confírmalo en la app cuando lo recibas.`;
        break;
      default:
        title = `Gasto recurrente: ${item.title}`;
        body = `${amount} el ${dateText}.`;
    }
    out.push({ id: `${item.type}:${item.accountId || item.debtId || item.occurrenceId}:${item.date}`, title, body, timestamp: when });
  }
  if (settings['notifications.dailyReminder']) {
    const h = Number(settings['notifications.dailyReminderHour'] ?? 21);
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    let when = atHour(today, h);
    if (when <= nowMs) when = atHour(addDays(today, 1), h);
    out.push({ id: 'daily-reminder', title: '¿Registraste tus gastos de hoy?', body: 'Un minuto ahora mantiene tus cuentas exactas.', timestamp: when, repeatDaily: true });
  }
  return out;
}

/**
 * Alertas inmediatas tras registrar movimientos: umbrales de presupuesto y
 * restante bajo. `key` se registra en notification_log para no repetirla.
 */
export function planImmediate({ settings, budgets = [], summary = null }) {
  if (!settings['notifications.enabled']) return [];
  const out = [];
  if (settings['notifications.budget']) {
    for (const b of budgets) {
      if (!b.reachedThreshold) continue;
      const name = b.category_name || 'Presupuesto general';
      out.push({
        key: `budget:${b.id}:${b.period.start}:${b.reachedThreshold}`,
        title: b.exceeded ? `Presupuesto superado: ${name}` : `${name}: ${b.reachedThreshold}% usado`,
        body: `Llevas ${formatMoney(b.spent)} de ${formatMoney(b.amount)}${b.exceeded ? ` (${formatMoney(-b.remaining)} por encima)` : ''}.`,
      });
    }
  }
  if (settings['notifications.lowRemaining'] && summary && summary.remaining.base !== 'none') {
    const pct = Number(settings['notifications.lowRemainingPercent'] ?? 20);
    const { remaining, baseAmount } = summary.remaining;
    if (baseAmount > 0 && remaining * 100 <= baseAmount * pct) {
      const over = remaining < 0;
      out.push({
        key: `low-remaining:${summary.period.start}:${pct}`,
        title: over ? 'Superaste lo disponible del periodo' : 'Te queda poco en este periodo',
        body: over
          ? `Llevas ${formatMoney(-remaining)} por encima de ${formatMoney(baseAmount)}${summary.remaining.estimated ? ' (estimado)' : ''}.`
          : `Restante: ${formatMoney(remaining)} de ${formatMoney(baseAmount)}${summary.remaining.estimated ? ' (estimado)' : ''}.`,
      });
    }
  }
  return out;
}
