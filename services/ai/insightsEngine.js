/**
 * Respuestas financieras deterministas, calculadas en la app (sin IA, sin red).
 * Cubren las preguntas habituales; el asistente con IA es solo una capa
 * opcional de redacción sobre estos mismos cálculos.
 */
import { formatMoney } from '../../utils/money';
import { formatDate } from '../../utils/dates';
import { PERIOD_LABELS } from '../../utils/periods';

export const QUICK_QUESTIONS = [
  { id: 'top_category', text: '¿En qué gasté más este periodo?' },
  { id: 'growing', text: '¿Qué categoría está aumentando?' },
  { id: 'budget', text: '¿Cómo voy con mi presupuesto?' },
  { id: 'recurring', text: '¿Qué gastos recurrentes tengo próximos?' },
  { id: 'debt_reserve', text: '¿Cuánto debería apartar para mi próxima deuda?' },
  { id: 'card', text: '¿Cuánto me conviene apartar para pagar mi tarjeta?' },
];

export function answerLocally(id, ctx) {
  const { summary, comparison, budgets = [], upcoming = [], debtPlan, cardPlan } = ctx;
  switch (id) {
    case 'top_category': {
      if (!summary || !summary.segments.length) return 'Aún no hay gastos registrados en este periodo.';
      const top = summary.segments.slice(0, 3).map(s => `${s.name} ${formatMoney(s.amount)} (${s.percent}%)`);
      return `Tu mayor gasto (${PERIOD_LABELS[summary.period.type].toLowerCase()}) es ${top[0]}.${top.length > 1 ? ` Le siguen ${top.slice(1).join(' y ')}.` : ''}`;
    }
    case 'growing': {
      if (!comparison) return 'No hay datos para comparar.';
      if (!comparison.previousSpending) return 'Aún no hay gastos en el periodo anterior para comparar.';
      const g = comparison.growing[0];
      if (!g) return `Ninguna categoría creció respecto al periodo anterior. Gasto total: ${formatMoney(comparison.spending)} frente a ${formatMoney(comparison.previousSpending)}.`;
      return `${g.name} subió ${formatMoney(g.change)}${g.changePercent !== null ? ` (+${g.changePercent}%)` : ''} respecto al periodo anterior.`;
    }
    case 'budget': {
      if (!budgets.length) return 'No tienes presupuestos configurados. Puedes crearlos en Presupuestos.';
      const lines = budgets.map(b => `${b.category_name || 'General'}: ${b.percent}% usado, ${b.remaining >= 0 ? `quedan ${formatMoney(b.remaining)}` : `excedido por ${formatMoney(-b.remaining)}`}`);
      return lines.slice(0, 4).join('. ') + '.';
    }
    case 'recurring': {
      const list = upcoming.filter(u => u.type === 'recurring_expense' || u.type === 'debt_due' || u.type === 'card_due').slice(0, 4);
      if (!list.length) return 'No hay pagos recurrentes ni vencimientos en los próximos 31 días.';
      return list.map(u => `${u.title}: ${formatMoney(u.amount)} el ${formatDate(u.date, { withYear: false })}`).join('. ') + '.';
    }
    case 'debt_reserve':
    case 'card': {
      const plan = id === 'card' ? cardPlan : debtPlan;
      if (!plan) return id === 'card' ? 'No hay tarjetas con deuda y fecha de pago configurada.' : 'No hay deudas activas con fecha de vencimiento.';
      return `Para ${plan.name}: aparta ${formatMoney(plan.perPeriod)} ${plan.perLabel} durante ${plan.periods} periodo(s) hasta el ${formatDate(plan.deadline)}. Ya tienes apartados ${formatMoney(plan.reserved)}. Es un cálculo aritmético sin intereses.`;
    }
    default:
      return null;
  }
}

/**
 * Contexto mínimo y agregado para la IA: nunca se envían movimientos
 * individuales, descripciones ni nombres de cuentas.
 */
export function buildAggregateContext(ctx) {
  const { summary, comparison, budgets = [], upcoming = [] } = ctx;
  const pesos = c => Math.round(c / 100);
  return {
    moneda: 'MXN',
    periodo: summary ? { tipo: summary.period.type, inicio: summary.period.start, fin: summary.period.end } : null,
    gastoTotal: summary ? pesos(summary.spent) : null,
    ingresos: summary ? pesos(summary.income) : null,
    restante: summary && summary.remaining.remaining !== null ? { valor: pesos(summary.remaining.remaining), base: summary.remaining.base, estimado: summary.remaining.estimated } : null,
    categorias: summary ? summary.segments.slice(0, 8).map(s => ({ nombre: s.name, gasto: pesos(s.amount), pct: s.percent })) : [],
    cambioVsAnterior: comparison ? { actual: pesos(comparison.spending), anterior: pesos(comparison.previousSpending) } : null,
    presupuestos: budgets.slice(0, 6).map(b => ({ categoria: b.category_name || 'General', limite: pesos(b.amount), usado: pesos(b.spent) })),
    proximos: upcoming.slice(0, 6).map(u => ({ tipo: u.type, fecha: u.date, importe: pesos(u.amount) })),
  };
}
