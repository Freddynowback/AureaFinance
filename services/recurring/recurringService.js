/**
 * Ingresos y gastos recurrentes.
 *
 * Las ocurrencias se materializan con INSERT OR IGNORE sobre la clave única
 * (regla, fecha): abrir la app varias veces o tras días sin conexión nunca
 * genera duplicados. Una ocurrencia prevista NO es dinero recibido: solo se
 * convierte en movimiento cuando el usuario la confirma, o automáticamente si
 * la regla tiene `auto_post` activado (automatización local explícita).
 */
import { recurringRepository } from '../../database/repositories/recurringRepository';
import { addDays, isISODate, nowDateTime, stamp, todayISO, toDateTime } from '../../utils/dates';
import { check, throwIfErrors, ValidationError } from '../../utils/errors';
import { uuid } from '../../utils/id';
import { nextOccurrence } from '../../utils/periods';
import { insertTransaction } from '../transactions/transactionService';

const FREQUENCIES = ['daily', 'weekly', 'biweekly', 'semimonthly', 'monthly', 'yearly', 'custom'];
export const LOOKAHEAD_DAYS = 45;

function normalize(input) {
  const f = {};
  check(f, ['income', 'expense'].includes(input.kind), 'kind', 'Tipo no válido');
  const name = (input.name || '').trim();
  check(f, !!name, 'name', 'Escribe un nombre');
  check(f, Number.isSafeInteger(input.amount) && input.amount > 0, 'amount', 'Importe no válido');
  check(f, FREQUENCIES.includes(input.frequency), 'frequency', 'Frecuencia no válida');
  if (input.frequency === 'custom') {
    check(f, Number.isInteger(Number(input.interval_days)) && Number(input.interval_days) >= 1, 'interval_days', 'Indica cada cuántos días');
  }
  check(f, isISODate(input.start_date), 'start_date', 'Fecha de inicio no válida');
  if (input.end_date) {
    check(f, isISODate(input.end_date) && input.end_date >= input.start_date, 'end_date', 'La fecha final debe ser posterior al inicio');
  }
  check(f, !!input.account_id, 'account_id', 'Selecciona una cuenta');
  if (input.kind === 'expense') check(f, !!input.category_id, 'category_id', 'Selecciona una categoría');
  throwIfErrors(f);
  return {
    kind: input.kind,
    name,
    amount: input.amount,
    account_id: input.account_id,
    category_id: input.category_id || null,
    payment_method: input.payment_method || null,
    income_type: input.kind === 'income' ? input.income_type || 'salary' : null,
    frequency: input.frequency,
    interval_days: input.frequency === 'custom' ? Number(input.interval_days) : null,
    start_date: input.start_date,
    end_date: input.end_date || null,
    auto_post: input.auto_post ? 1 : 0,
    status: input.status || 'active',
    notes: (input.notes || '').trim() || null,
  };
}

export function* occurrenceDates(rule, from, until) {
  let d = rule.start_date;
  const anchorDay = Number(rule.start_date.slice(8, 10));
  for (let i = 0; i < 5000 && d <= until; i++) {
    if (rule.end_date && d > rule.end_date) return;
    if (d >= from) yield d;
    d = nextOccurrence(d, rule.frequency, { intervalDays: rule.interval_days, anchorDay });
  }
}

/** Genera ocurrencias faltantes de una regla hasta `today + LOOKAHEAD_DAYS`. */
export async function generateOccurrences(tx, rule, today = todayISO()) {
  if (rule.status !== 'active') return 0;
  const until = addDays(today, LOOKAHEAD_DAYS);
  const last = await recurringRepository.lastOccurrenceDate(tx, rule.id);
  const from = last && last.d ? addDays(last.d, 1) : rule.start_date;
  let created = 0;
  for (const date of occurrenceDates(rule, from, until)) {
    const res = await recurringRepository.insertOccurrenceIfMissing(tx, {
      id: uuid(),
      rule_id: rule.id,
      due_date: date,
      amount: rule.amount,
      created_at: stamp(),
    });
    created += res.changes;
  }
  return created;
}

async function postOccurrence(tx, occ, rule, origin, overrides = {}) {
  const t = await insertTransaction(tx, {
    kind: rule.kind,
    amount: overrides.amount ?? occ.amount,
    account_id: overrides.account_id || rule.account_id,
    category_id: rule.category_id,
    payment_method: rule.payment_method,
    income_type: rule.income_type,
    source: rule.kind === 'income' ? rule.name : null,
    description: rule.name,
    occurred_at: overrides.occurred_at || toDateTime(occ.due_date, '12:00:00'),
    recurring_occurrence_id: occ.id,
    origin,
  });
  await recurringRepository.setOccurrenceStatus(tx, occ.id, 'confirmed', t.id);
  return t;
}

/**
 * Sincroniza todas las reglas: genera ocurrencias y, solo en reglas con
 * auto_post, registra las vencidas. Idempotente.
 */
export function syncRecurring(db, today = todayISO()) {
  return db.transaction(async tx => {
    const rules = await recurringRepository.listRules(tx);
    let generated = 0;
    let posted = 0;
    const failed = [];
    for (const rule of rules) {
      generated += await generateOccurrences(tx, rule, today);
      if (rule.auto_post && rule.status === 'active') {
        const due = await tx.all(
          "SELECT * FROM recurring_occurrences WHERE rule_id = ? AND status = 'pending' AND due_date <= ?",
          [rule.id, today],
        );
        for (const occ of due) {
          try {
            // La validación ocurre antes de escribir: si falla, no queda nada a medias.
            await postOccurrence(tx, occ, rule, 'recurring_auto');
            posted++;
          } catch (e) {
            // P. ej. cuenta archivada: la ocurrencia queda pendiente para revisarla a mano.
            failed.push({ ruleId: rule.id, name: rule.name, dueDate: occ.due_date, reason: e.message });
          }
        }
      }
    }
    return { generated, posted, failed };
  });
}

export function createRule(db, input, today = todayISO()) {
  return db.transaction(async tx => {
    const data = normalize(input);
    await validateReferences(tx, data);
    const now = stamp();
    const rule = { id: uuid(), ...data, created_at: now, updated_at: now };
    await recurringRepository.insertRule(tx, rule);
    await generateOccurrences(tx, rule, today);
    return rule;
  });
}

/** Al editar, se regeneran solo las ocurrencias pendientes futuras. */
export function updateRule(db, id, input, today = todayISO()) {
  return db.transaction(async tx => {
    const prev = await recurringRepository.getRule(tx, id);
    if (!prev) throw new ValidationError({ id: 'La recurrencia no existe' });
    const data = normalize({ ...prev, ...input });
    await validateReferences(tx, data);
    const rule = { ...prev, ...data, updated_at: stamp() };
    await recurringRepository.updateRule(tx, rule);
    await recurringRepository.deletePendingFrom(tx, id, today);
    // Regenerar desde hoy sin duplicar fechas ya confirmadas u omitidas.
    const until = addDays(today, LOOKAHEAD_DAYS);
    if (rule.status === 'active') {
      for (const date of occurrenceDates(rule, today, until)) {
        await recurringRepository.insertOccurrenceIfMissing(tx, {
          id: uuid(), rule_id: id, due_date: date, amount: rule.amount, created_at: stamp(),
        });
      }
    }
    return rule;
  });
}

export const deleteRule = (db, id) => recurringRepository.deleteRule(db, id);

export function confirmOccurrence(db, occurrenceId, overrides = {}) {
  return db.transaction(async tx => {
    const occ = await recurringRepository.getOccurrence(tx, occurrenceId);
    if (!occ) throw new ValidationError({ id: 'La ocurrencia no existe' });
    if (occ.status !== 'pending') {
      throw new ValidationError({ id: occ.status === 'confirmed' ? 'Ya estaba confirmada' : 'Esta ocurrencia se omitió' });
    }
    const rule = await recurringRepository.getRule(tx, occ.rule_id);
    return postOccurrence(tx, occ, rule, 'recurring', {
      ...overrides,
      occurred_at: overrides.occurred_at || nowDateTime(),
    });
  });
}

export function skipOccurrence(db, occurrenceId) {
  return db.transaction(async tx => {
    const occ = await recurringRepository.getOccurrence(tx, occurrenceId);
    if (!occ) throw new ValidationError({ id: 'La ocurrencia no existe' });
    if (occ.status !== 'pending') throw new ValidationError({ id: 'Solo se pueden omitir ocurrencias pendientes' });
    await recurringRepository.setOccurrenceStatus(tx, occurrenceId, 'skipped', null);
  });
}

/** La cuenta y la categoría deben ser compatibles con el tipo de la regla. */
async function validateReferences(tx, data) {
  const f = {};
  const acc = await tx.get('SELECT type, status FROM accounts WHERE id = ?', [data.account_id]);
  check(f, !!acc && acc.status === 'active', 'account_id', 'Selecciona una cuenta activa');
  if (acc && data.kind === 'income') check(f, acc.type !== 'credit', 'account_id', 'Un ingreso debe llegar a una cuenta de efectivo, débito o ahorro');
  if (data.category_id) {
    const cat = await tx.get('SELECT kind, status FROM categories WHERE id = ?', [data.category_id]);
    const wanted = data.kind === 'income' ? 'income' : 'expense';
    check(f, !!cat && (cat.kind === wanted || cat.kind === 'both'), 'category_id', 'La categoría no corresponde a este tipo');
  }
  throwIfErrors(f);
}

export const listRules = (db, opts) => recurringRepository.listRules(db, opts);

export const upcoming = (db, { from, to, kind } = {}) =>
  recurringRepository.occurrences(db, { from, to, kind, status: 'pending' });
