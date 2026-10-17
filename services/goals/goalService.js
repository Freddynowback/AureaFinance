/**
 * Metas de ahorro.
 *  - mode 'virtual': el dinero se queda en su cuenta y solo se marca como
 *    apartado (reserva). Se muestra como "reserva virtual".
 *  - mode 'account': la aportación es una transferencia real hacia la cuenta
 *    de ahorro de la meta, más la reserva correspondiente. No es un gasto.
 * Ninguna aportación crea dinero: solo se aparta o mueve dinero existente.
 */
import { accountsRepository } from '../../database/repositories/accountsRepository';
import { goalsRepository } from '../../database/repositories/goalsRepository';
import { reservationsRepository } from '../../database/repositories/reservationsRepository';
import { isISODate, nowDateTime, stamp } from '../../utils/dates';
import { check, throwIfErrors, ValidationError } from '../../utils/errors';
import { uuid } from '../../utils/id';
import { insertTransaction } from '../transactions/transactionService';

async function normalize(db, input) {
  const f = {};
  const name = (input.name || '').trim();
  check(f, !!name, 'name', 'Escribe un nombre');
  check(f, Number.isSafeInteger(input.target_amount) && input.target_amount > 0, 'target_amount', 'Importe objetivo no válido');
  if (input.deadline) check(f, isISODate(input.deadline), 'deadline', 'Fecha no válida');
  const mode = input.mode || 'virtual';
  check(f, ['virtual', 'account'].includes(mode), 'mode', 'Modo no válido');
  if (mode === 'account') {
    const acc = input.account_id ? await accountsRepository.get(db, input.account_id) : null;
    check(f, !!acc && acc.type !== 'credit', 'account_id', 'Elige la cuenta de ahorro de la meta');
  }
  throwIfErrors(f);
  return {
    name,
    target_amount: input.target_amount,
    deadline: input.deadline || null,
    mode,
    account_id: mode === 'account' ? input.account_id || null : null,
    color: input.color || '#46C5B0',
    notes: (input.notes || '').trim() || null,
  };
}

export async function createGoal(db, input) {
  const data = await normalize(db, input);
  const now = stamp();
  const g = { id: uuid(), ...data, status: 'active', created_at: now, updated_at: now };
  await goalsRepository.insert(db, g);
  return g;
}

export async function updateGoal(db, id, input) {
  const prev = await goalsRepository.get(db, id);
  if (!prev) throw new ValidationError({ id: 'La meta no existe' });
  const data = await normalize(db, { ...prev, ...input });
  await goalsRepository.update(db, { ...prev, ...data, status: input.status || prev.status, updated_at: stamp() });
}

/**
 * Aportación (amount > 0) o retirada (amount < 0).
 * En modo cuenta se requiere `fromAccountId` (aportación) o `toAccountId`
 * (retirada) y se crea la transferencia en la misma transacción.
 */
export function moveGoalMoney(db, goalId, amount, { fromAccountId, toAccountId, note, occurredAt } = {}) {
  return db.transaction(async tx => {
    const goal = await goalsRepository.get(tx, goalId);
    if (!goal) throw new ValidationError({ id: 'La meta no existe' });
    if (!Number.isSafeInteger(amount) || amount === 0) throw new ValidationError({ amount: 'Importe no válido' });
    if (amount < 0 && goal.saved + amount < 0) throw new ValidationError({ amount: 'No puedes retirar más de lo acumulado' });
    const when = occurredAt || nowDateTime();
    let transfer = null;
    let accountId = goal.mode === 'virtual' ? null : fromAccountId || null;
    for (const [key, id] of [['fromAccountId', fromAccountId], ['toAccountId', toAccountId]]) {
      if (!id) continue;
      const a = await accountsRepository.get(tx, id);
      if (!a || a.type === 'credit') {
        throw new ValidationError({ [key]: 'Las metas solo usan dinero propio: elige efectivo, débito o ahorro' });
      }
    }
    if (goal.mode === 'account') {
      if (amount > 0) {
        if (!fromAccountId) throw new ValidationError({ fromAccountId: 'Elige de qué cuenta sale el dinero' });
        transfer = await insertTransaction(tx, {
          kind: 'transfer', amount, account_id: fromAccountId, to_account_id: goal.account_id,
          occurred_at: when, description: `Aportación a meta: ${goal.name}`,
        });
      } else {
        if (!toAccountId) throw new ValidationError({ toAccountId: 'Elige a qué cuenta vuelve el dinero' });
        transfer = await insertTransaction(tx, {
          kind: 'transfer', amount: -amount, account_id: goal.account_id, to_account_id: toAccountId,
          occurred_at: when, description: `Retiro de meta: ${goal.name}`,
        });
      }
      accountId = goal.account_id;
    }
    const r = {
      id: uuid(),
      target_type: 'goal',
      target_id: goalId,
      amount,
      account_id: accountId,
      transaction_id: transfer ? transfer.id : null,
      occurred_at: when,
      note: (note || '').trim() || (amount > 0 ? 'Aportación' : 'Retiro'),
      created_at: stamp(),
    };
    await reservationsRepository.insert(tx, r);
    return { reservation: r, transfer };
  });
}

export const listGoals = (db, opts) => goalsRepository.list(db, opts);
export const getGoal = (db, id) => goalsRepository.get(db, id);
export const goalMovements = (db, id) => reservationsRepository.list(db, 'goal', id);

export function deleteGoal(db, id) {
  return db.transaction(async tx => {
    await reservationsRepository.deleteForTarget(tx, 'goal', id);
    await goalsRepository.delete(tx, id);
  });
}
