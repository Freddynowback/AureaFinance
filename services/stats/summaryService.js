/**
 * Resumen del periodo para el círculo financiero y la pantalla de inicio.
 *
 * Conceptos separados (nunca se mezclan):
 *  - spent:        gasto neto del periodo (gastos - devoluciones)
 *  - income:       ingresos recibidos en el periodo
 *  - remaining:    restante PRESUPUESTARIO del periodo (base - gasto), cuya base
 *                  puede ser un presupuesto general, los ingresos del periodo o
 *                  los ingresos previstos (estimación)
 *  - liquid:       saldo líquido total de las cuentas (dinero real hoy)
 *  - available:    liquid - apartados para deudas/metas
 */
import { budgetsRepository } from '../../database/repositories/budgetsRepository';
import { recurringRepository } from '../../database/repositories/recurringRepository';
import { transactionsRepository } from '../../database/repositories/transactionsRepository';
import { addDays, todayISO } from '../../utils/dates';
import { percentages } from '../../utils/money';
import { getPeriod } from '../../utils/periods';

/** Segmentos del anillo: categorías con gasto neto > 0, orden descendente. */
export function buildSegments(rows) {
  const items = rows
    .map(r => ({
      categoryId: r.category_id,
      name: r.name,
      color: r.color,
      icon: r.icon,
      archived: r.status === 'archived',
      amount: (r.gross || 0) - (r.refunds || 0),
      count: r.count || 0,
    }))
    .filter(i => i.amount > 0)
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
  const pct = percentages(items.map(i => i.amount), 1);
  return items.map((i, idx) => ({ ...i, percent: pct[idx] }));
}

/**
 * Decide la base del restante.
 * mode: 'auto' | 'budget' | 'income'
 */
export function resolveRemaining({ mode = 'auto', budget, income, expectedIncome, spent }) {
  const pick = base => {
    if (base === 'budget' && budget) {
      return { base: 'budget', baseAmount: budget.amount, estimated: false };
    }
    if (base === 'income' && income > 0) {
      return { base: 'income', baseAmount: income, estimated: false };
    }
    if (base === 'expected' && expectedIncome > 0) {
      return { base: 'expected', baseAmount: income + expectedIncome, estimated: true };
    }
    return null;
  };
  const order =
    mode === 'budget'
      ? ['budget']
      : mode === 'income'
        ? ['income', 'expected']
        : ['budget', 'income', 'expected'];
  for (const b of order) {
    const r = pick(b);
    if (r) return { ...r, remaining: r.baseAmount - spent };
  }
  return { base: 'none', baseAmount: null, remaining: null, estimated: false };
}

export async function getPeriodSummary(db, { periodSettings, ref = todayISO(), remainingMode = 'auto', period: given } = {}) {
  const period = given || getPeriod(ref, periodSettings);
  const [rows, totals] = await Promise.all([
    transactionsRepository.spendingByCategory(db, period.start, period.end),
    transactionsRepository.totals(db, period.start, period.end),
  ]);
  const segments = buildSegments(rows);
  const spent = Math.max(0, totals.net_spending);

  let budget = null;
  if (['weekly', 'biweekly', 'monthly'].includes(period.type)) {
    budget = await budgetsRepository.findGeneral(db, period.type);
  }
  const expected = await recurringRepository.occurrences(db, {
    from: period.start,
    to: addDays(period.end, -1),
    kind: 'income',
    status: 'pending',
  });
  const expectedIncome = expected.reduce((s, o) => s + o.amount, 0);

  const remaining = resolveRemaining({
    mode: remainingMode,
    budget,
    income: totals.income,
    expectedIncome,
    spent,
  });

  return {
    period,
    spent,
    grossExpenses: totals.expenses,
    refunds: totals.refunds,
    income: totals.income,
    expectedIncome,
    cardPayments: totals.card_payments,
    movementCount: totals.count,
    segments,
    topCategory: segments[0] || null,
    remaining,
    budget,
  };
}

/** Movimientos del periodo para el estado de cuenta (opcionalmente por categoría). */
export function periodStatement(db, period, { categoryId } = {}) {
  return transactionsRepository.search(
    db,
    {
      from: period.start,
      to: period.end,
      kinds: ['expense', 'refund'],
      categoryIds: categoryId ? [categoryId] : undefined,
    },
    { limit: 500 },
  );
}
