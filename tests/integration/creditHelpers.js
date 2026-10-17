import { transactionsRepository } from '../../database/repositories/transactionsRepository';

/** Comprueba que los totales de gasto del año no incluyen ajustes. */
export async function totalsRepoCheck(db, { expenses }) {
  const t = await transactionsRepository.totals(db, '2026-01-01', '2027-01-01');
  if (t.expenses !== expenses || t.net_spending !== expenses) {
    throw new Error(`Gasto esperado ${expenses}, obtenido ${t.expenses}`);
  }
}
