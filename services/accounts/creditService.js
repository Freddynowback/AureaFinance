/**
 * Resumen real del crédito de una tarjeta o cuenta de crédito.
 *
 *  - limit:     crédito total autorizado (lo configura el usuario).
 *  - used:      crédito en uso = deuda total de la tarjeta (compras + cargos +
 *               financiaciones − pagos − devoluciones). Se calcula de los
 *               movimientos, así que se actualiza solo al pagar o cargar.
 *  - available: limit − used + saldo a favor (negativo = por encima del límite).
 *  - financed:  parte de lo usado que está en planes de financiación activos
 *               (saldo pendiente de cada plan, no solo el pago del mes).
 *  - monthlyDue: suma de lo que toca pagar este mes de esos planes.
 *  - revolving: lo usado que no está financiado.
 *
 * Si las financiaciones suman más que la deuda de la tarjeta, alguna no está
 * incluida en la deuda registrada: se marca `unreconciled` para avisar.
 */
export function creditSummary(account, debts = []) {
  const balance = account.balance || 0;
  const used = balance < 0 ? -balance : 0;
  const inFavor = balance > 0 ? balance : 0;
  const limit = account.credit_limit || null;
  const plans = debts.filter(d => d.account_id === account.id && d.status === 'active' && d.outstanding > 0);
  const financed = plans.reduce((s, d) => s + d.outstanding, 0);
  const monthlyDue = plans.reduce((s, d) => s + (d.monthly_payment ? Math.min(d.monthly_payment, d.outstanding) : 0), 0);
  const plansWithoutMonthly = plans.filter(d => !d.monthly_payment).length;
  // Un saldo a favor (pagaste de más) también suma al disponible, como en el banco.
  const available = limit !== null ? limit - used + inFavor : null;
  return {
    limit,
    used,
    inFavor,
    available,
    overLimit: limit !== null && used > limit,
    utilization: limit ? Math.round((used * 1000) / limit) / 10 : null,
    financed: Math.min(financed, used),
    financedTotal: financed,
    monthlyDue,
    plansCount: plans.length,
    plansWithoutMonthly,
    revolving: Math.max(0, used - financed),
    unreconciled: financed > used ? financed - used : 0,
  };
}

/** Totales de varias tarjetas (solo las que tienen límite cuentan para el disponible). */
export function creditTotals(summaries) {
  const withLimit = summaries.filter(s => s.limit !== null);
  return {
    limit: withLimit.reduce((s, x) => s + x.limit, 0),
    used: summaries.reduce((s, x) => s + x.used, 0),
    available: withLimit.reduce((s, x) => s + x.available, 0),
    financed: summaries.reduce((s, x) => s + x.financed, 0),
    monthlyDue: summaries.reduce((s, x) => s + x.monthlyDue, 0),
    cardsWithoutLimit: summaries.length - withLimit.length,
  };
}

/**
 * Aviso no bloqueante antes de cargar `amount` a una tarjeta: devuelve null
 * si cabe en el disponible, o el exceso si lo supera.
 */
export function checkCreditCharge(summary, amount, previousAmount = 0) {
  if (!summary || summary.limit === null) return null;
  const after = summary.used - previousAmount + amount;
  if (after <= summary.limit) return null;
  return { after, over: after - summary.limit, limit: summary.limit };
}
