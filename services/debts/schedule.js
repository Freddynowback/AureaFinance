/**
 * Pago del mes de cada financiación, con pago mensual fijo o con calendario.
 *
 *  - Pago fijo: el del mes es `monthly_payment` (o lo que quede si es menos).
 *  - Calendario: el usuario captura a mano cada mes que le muestra su banco.
 *    El saldo pendiente cubre los ÚLTIMOS meses del calendario: los pagos
 *    vinculados al plan se aplican a los meses más antiguos. Así, el mes en
 *    curso es el más antiguo que aún tiene algo pendiente.
 *
 * Nunca se estima un pago: sin pago fijo ni calendario, `monthlyDue` es null.
 */
import { debtsRepository } from '../../database/repositories/debtsRepository';
import { addMonths, todayISO } from '../../utils/dates';

/** Próximo vencimiento de un plan con pago fijo, avanzando mes a mes hasta hoy. */
export function effectiveDueDate(debt, today = todayISO()) {
  if (!debt.next_due_date) return null;
  let d = debt.next_due_date;
  const day = Number(debt.next_due_date.slice(8, 10));
  for (let i = 0; d < today && i < 240; i++) d = addMonths(debt.next_due_date, i + 1, day);
  return d;
}

/**
 * Estado del calendario para un saldo pendiente.
 *  - pending: meses que faltan (el primero puede estar pagado en parte).
 *  - current: el mes en curso ({ due_date, amount, full }) o null si no queda nada.
 *  - excess:  saldo pendiente que el calendario no cubre (> 0 = no cuadra).
 */
export function scheduleStatus(items, outstanding) {
  const sorted = [...items].sort((a, b) => (a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0));
  const total = sorted.reduce((s, it) => s + it.amount, 0);
  let left = Math.max(0, outstanding || 0);
  const pending = [];
  for (let i = sorted.length - 1; i >= 0 && left > 0; i--) {
    const amount = Math.min(sorted[i].amount, left);
    pending.unshift({ ...sorted[i], amount, full: sorted[i].amount });
    left -= amount;
  }
  return {
    items: sorted,
    pending,
    total,
    current: pending[0] || null,
    paidCount: sorted.length - pending.length,
    excess: left,
  };
}

/** Añade a cada deuda el pago del mes (`monthlyDue`), su vencimiento y su calendario. */
export function withPayments(debts, scheduleItems = [], today = todayISO()) {
  const byDebt = {};
  for (const it of scheduleItems) (byDebt[it.debt_id] = byDebt[it.debt_id] || []).push(it);
  return debts.map(d => {
    const items = byDebt[d.id];
    if (items && items.length) {
      const schedule = scheduleStatus(items, d.outstanding);
      return {
        ...d,
        schedule,
        monthlyDue: schedule.current ? schedule.current.amount : null,
        effectiveDueDate: schedule.current ? schedule.current.due_date : null,
        installmentsLeft: schedule.pending.length,
      };
    }
    const outstanding = Math.max(0, d.outstanding || 0);
    return {
      ...d,
      schedule: null,
      monthlyDue: d.monthly_payment ? Math.min(d.monthly_payment, outstanding) : null,
      effectiveDueDate: effectiveDueDate(d, today),
      installmentsLeft: d.installments_remaining ?? null,
    };
  });
}

/** Deudas del repositorio con su pago del mes. */
export async function loadDebtsWithPayments(db, opts, today = todayISO()) {
  const [debts, items] = await Promise.all([debtsRepository.list(db, opts), debtsRepository.allScheduleItems(db)]);
  return withPayments(debts, items, today);
}

/** Pago del mes de un plan ya decorado (o crudo, con pago fijo). */
export function monthlyDueOf(d) {
  if (d.monthlyDue !== undefined) return d.monthlyDue;
  return d.monthly_payment ? Math.min(d.monthly_payment, Math.max(0, d.outstanding || 0)) : null;
}
