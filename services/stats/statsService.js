/**
 * Estadísticas derivadas de los movimientos almacenados y de las reglas
 * contables centralizadas (gasto neto = gastos - devoluciones; transferencias
 * y pagos de tarjeta no son gasto).
 */
import { transactionsRepository } from '../../database/repositories/transactionsRepository';
import { addDays, addMonths, diffDays, startOfMonth, todayISO } from '../../utils/dates';
import { ratioPercent } from '../../utils/money';
import { shiftPeriod } from '../../utils/periods';
import { buildSegments } from './summaryService';

/** Serie continua (rellena días/meses sin movimientos con 0). */
export async function spendingSeries(db, from, to, bucket = 'day') {
  const rows = await transactionsRepository.series(db, from, to, bucket);
  const map = new Map(rows.map(r => [r.bucket, r]));
  const out = [];
  if (bucket === 'month') {
    for (let d = startOfMonth(from); d < to; d = addMonths(d, 1)) {
      const k = d.slice(0, 7);
      const r = map.get(k);
      out.push({ key: k, date: d, spending: r ? r.spending : 0, income: r ? r.income : 0 });
    }
  } else if (bucket === 'week') {
    for (let d = from; d < to; d = addDays(d, 7)) {
      let spending = 0;
      let income = 0;
      for (let i = 0; i < 7; i++) {
        const r = map.get(addDays(d, i));
        if (r && addDays(d, i) < to) {
          spending += r.spending;
          income += r.income;
        }
      }
      out.push({ key: d, date: d, spending, income });
    }
  } else {
    for (let d = from; d < to; d = addDays(d, 1)) {
      const r = map.get(d);
      out.push({ key: d, date: d, spending: r ? r.spending : 0, income: r ? r.income : 0 });
    }
  }
  return out;
}

export async function seriesForRange(db, from, to) {
  const days = diffDays(from, to);
  const bucket = days <= 31 ? 'day' : days <= 120 ? 'week' : 'month';
  const raw = await transactionsRepository.series(db, from, to, bucket === 'month' ? 'month' : 'day');
  if (bucket === 'week') {
    const map = new Map(raw.map(r => [r.bucket, r]));
    const out = [];
    for (let d = from; d < to; d = addDays(d, 7)) {
      let spending = 0;
      let income = 0;
      for (let i = 0; i < 7 && addDays(d, i) < to; i++) {
        const r = map.get(addDays(d, i));
        if (r) {
          spending += r.spending;
          income += r.income;
        }
      }
      out.push({ key: d, date: d, spending, income });
    }
    return { bucket, points: out };
  }
  return { bucket, points: await spendingSeries(db, from, to, bucket) };
}

/** Comparación con el periodo anterior de la misma duración/tipo. */
export async function compareWithPrevious(db, period, periodSettings) {
  const prev = shiftPeriod(period, -1, periodSettings);
  const [cur, old, curCats, oldCats] = await Promise.all([
    transactionsRepository.totals(db, period.start, period.end),
    transactionsRepository.totals(db, prev.start, prev.end),
    transactionsRepository.spendingByCategory(db, period.start, period.end),
    transactionsRepository.spendingByCategory(db, prev.start, prev.end),
  ]);
  const oldMap = new Map(buildSegments(oldCats).map(s => [s.categoryId, s.amount]));
  const categories = buildSegments(curCats).map(s => {
    const before = oldMap.get(s.categoryId) || 0;
    return { ...s, previous: before, change: s.amount - before, changePercent: before ? ratioPercent(s.amount - before, before) : null };
  });
  const growing = categories.filter(c => c.change > 0).sort((a, b) => b.change - a.change);
  return {
    period,
    previousPeriod: prev,
    spending: Math.max(0, cur.net_spending),
    previousSpending: Math.max(0, old.net_spending),
    income: cur.income,
    previousIncome: old.income,
    change: cur.net_spending - old.net_spending,
    changePercent: old.net_spending > 0 ? ratioPercent(cur.net_spending - old.net_spending, old.net_spending) : null,
    categories,
    growing,
  };
}

/** Ingresos frente a gastos de los últimos `months` meses. */
export async function incomeVsExpenses(db, months = 6, today = todayISO()) {
  const end = addMonths(startOfMonth(today), 1);
  const start = addMonths(end, -months);
  return spendingSeries(db, start, end, 'month');
}

/** Gasto variable medio diario en las últimas `days` jornadas (para proyecciones). */
export async function averageDailySpending(db, days = 56, today = todayISO()) {
  const from = addDays(today, -days);
  const first = await db.get("SELECT MIN(occurred_at) AS d FROM transactions WHERE kind = 'expense'");
  if (!first || !first.d) return null;
  const effectiveFrom = first.d.slice(0, 10) > from ? first.d.slice(0, 10) : from;
  const span = Math.max(1, diffDays(effectiveFrom, today));
  if (span < 7) return null; // muy poco historial para estimar
  const totals = await transactionsRepository.totals(db, effectiveFrom, addDays(today, 1));
  return Math.round(Math.max(0, totals.net_spending) / span);
}

/**
 * Evolución de la deuda de financiaciones: en cada fecha de muestra, saldo
 * del último registro conciliado (por fecha) menos los pagos vinculados
 * posteriores hasta esa fecha. Es una reconstrucción para la gráfica.
 */
export async function debtEvolution(db, from, to, points = 8) {
  const [snaps, pays] = await Promise.all([
    db.all('SELECT debt_id, balance, recorded_at FROM debt_balance_snapshots ORDER BY recorded_at'),
    db.all("SELECT debt_id, amount, occurred_at FROM transactions WHERE kind = 'card_payment' AND debt_id IS NOT NULL ORDER BY occurred_at"),
  ]);
  if (!snaps.length) return [];
  const span = Math.max(1, diffDays(from, to));
  const step = Math.max(1, Math.round(span / points));
  const out = [];
  const debtIds = [...new Set(snaps.map(s => s.debt_id))];
  for (let d = addDays(from, step - 1); ; d = addDays(d, step)) {
    const day = d < to ? d : addDays(to, -1);
    const end = `${day} 23:59:59`;
    let total = 0;
    for (const id of debtIds) {
      const snap = snaps.filter(s => s.debt_id === id && s.recorded_at <= end).pop();
      if (!snap) continue;
      const paid = pays.filter(p => p.debt_id === id && p.occurred_at > snap.recorded_at && p.occurred_at <= end).reduce((s, p) => s + p.amount, 0);
      total += Math.max(0, snap.balance - paid);
    }
    out.push({ date: day, value: total });
    if (day >= addDays(to, -1)) break;
  }
  return out;
}
