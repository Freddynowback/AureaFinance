/**
 * Presupuestos generales y por categoría. El consumo se calcula con el gasto
 * neto (gastos - devoluciones) del periodo; ediciones y borrados se reflejan
 * solos porque nada se acumula.
 */
import { budgetsRepository } from '../../database/repositories/budgetsRepository';
import { transactionsRepository } from '../../database/repositories/transactionsRepository';
import { stamp, todayISO } from '../../utils/dates';
import { check, throwIfErrors, ValidationError } from '../../utils/errors';
import { uuid } from '../../utils/id';
import { ratioPercent } from '../../utils/money';
import { getPeriod, shiftPeriod } from '../../utils/periods';

export function parseThresholds(text) {
  const values = String(text || '')
    .split(',')
    .map(s => Number(s.trim()))
    .filter(n => Number.isInteger(n) && n > 0 && n <= 200);
  return [...new Set(values)].sort((a, b) => a - b);
}

async function normalize(db, input, id) {
  const f = {};
  check(f, ['weekly', 'biweekly', 'monthly'].includes(input.period_type), 'period_type', 'Periodo no válido');
  check(f, Number.isSafeInteger(input.amount) && input.amount > 0, 'amount', 'Introduce un límite mayor que cero');
  const thresholds = parseThresholds(input.thresholds ?? '50,80,100');
  check(f, thresholds.length > 0, 'thresholds', 'Indica al menos un umbral (por ejemplo 50,80,100)');
  throwIfErrors(f);
  const dup = await db.get(
    "SELECT id FROM budgets WHERE COALESCE(category_id, '') = COALESCE(?, '') AND period_type = ? AND id <> ?",
    [input.category_id || null, input.period_type, id || ''],
  );
  if (dup) throw new ValidationError({ category_id: 'Ya existe un presupuesto para esa categoría y periodo' });
  return {
    category_id: input.category_id || null,
    period_type: input.period_type,
    amount: input.amount,
    thresholds: thresholds.join(','),
    active: input.active === undefined ? 1 : input.active ? 1 : 0,
  };
}

export async function createBudget(db, input) {
  const data = await normalize(db, input, null);
  const now = stamp();
  const record = { id: uuid(), ...data, created_at: now, updated_at: now };
  await budgetsRepository.insert(db, record);
  return record;
}

export async function updateBudget(db, id, input) {
  const prev = await budgetsRepository.get(db, id);
  if (!prev) throw new ValidationError({ id: 'El presupuesto no existe' });
  const data = await normalize(db, { ...prev, ...input }, id);
  await budgetsRepository.update(db, { ...prev, ...data, updated_at: stamp() });
}

export const deleteBudget = (db, id) => budgetsRepository.delete(db, id);

/** Estado de un presupuesto en el periodo que contiene `ref`. */
export async function budgetStatus(db, budget, periodSettings, ref = todayISO()) {
  const period = getPeriod(ref, { ...periodSettings, type: budget.period_type });
  let spent;
  if (budget.category_id) {
    const rows = await transactionsRepository.spendingByCategory(db, period.start, period.end);
    const row = rows.find(r => r.category_id === budget.category_id);
    spent = row ? row.gross - row.refunds : 0;
  } else {
    spent = (await transactionsRepository.totals(db, period.start, period.end)).net_spending;
  }
  spent = Math.max(0, spent);
  const percent = ratioPercent(spent, budget.amount);
  const thresholds = parseThresholds(budget.thresholds);
  const reached = thresholds.filter(t => percent >= t);
  return {
    ...budget,
    period,
    spent,
    remaining: budget.amount - spent,
    percent,
    thresholds,
    reachedThreshold: reached.length ? reached[reached.length - 1] : null,
    exceeded: spent > budget.amount,
  };
}

export async function listBudgetStatus(db, periodSettings, ref = todayISO()) {
  const budgets = await budgetsRepository.list(db);
  const result = [];
  for (const b of budgets) result.push(await budgetStatus(db, b, periodSettings, ref));
  return result;
}

/** Historial de los últimos `count` periodos de un presupuesto. */
export async function budgetHistory(db, budget, periodSettings, count = 6, ref = todayISO()) {
  const history = [];
  let period = getPeriod(ref, { ...periodSettings, type: budget.period_type });
  for (let i = 0; i < count; i++) {
    const status = await budgetStatus(db, budget, periodSettings, period.start);
    history.push({ period, spent: status.spent, percent: status.percent, exceeded: status.exceeded });
    period = shiftPeriod(period, -1, { ...periodSettings, type: budget.period_type });
  }
  return history.reverse();
}

/**
 * Aviso no bloqueante antes de guardar un gasto: qué presupuestos se
 * superarían. El gasto se puede guardar igualmente.
 */
export async function previewBudgetImpact(db, { categoryId, amount, occurredAt, excludeAmount = 0 }, periodSettings) {
  const budgets = await budgetsRepository.list(db);
  const warnings = [];
  for (const b of budgets) {
    if (b.category_id && b.category_id !== categoryId) continue;
    const s = await budgetStatus(db, b, periodSettings, occurredAt.slice(0, 10));
    const after = s.spent - excludeAmount + amount;
    if (after > b.amount) {
      warnings.push({ budget: s, after, over: after - b.amount });
    }
  }
  return warnings;
}
