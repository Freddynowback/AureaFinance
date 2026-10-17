/**
 * Categorías personalizables. Una categoría con historial nunca se borra en
 * silencio: se archiva o se reasignan sus movimientos antes de eliminarla.
 */
import { categoriesRepository } from '../../database/repositories/categoriesRepository';
import { CATEGORY_COLORS } from '../../config/categories';
import { stamp } from '../../utils/dates';
import { check, throwIfErrors, ValidationError } from '../../utils/errors';
import { uuid } from '../../utils/id';

const KINDS = ['expense', 'income', 'both'];

async function normalize(db, input, id) {
  const f = {};
  const name = (input.name || '').trim();
  check(f, !!name, 'name', 'Escribe un nombre');
  check(f, name.length <= 40, 'name', 'Máximo 40 caracteres');
  check(f, KINDS.includes(input.kind), 'kind', 'Tipo no válido');
  check(f, /^#[0-9A-Fa-f]{6}$/.test(input.color || ''), 'color', 'Color no válido');
  check(f, !!input.icon, 'icon', 'Elige un icono');
  if (name) {
    const existing = await categoriesRepository.findByName(db, name);
    check(f, !existing || existing.id === id, 'name', 'Ya existe una categoría con ese nombre');
  }
  throwIfErrors(f);
  return { name, kind: input.kind, color: input.color.toUpperCase(), icon: input.icon };
}

export async function createCategory(db, input) {
  const data = await normalize(db, input, null);
  const now = stamp();
  const record = { id: uuid(), ...data, status: 'active', sort_order: 100, created_at: now, updated_at: now };
  await categoriesRepository.insert(db, record);
  return record;
}

export async function updateCategory(db, id, input) {
  const prev = await categoriesRepository.get(db, id);
  if (!prev) throw new ValidationError({ id: 'La categoría no existe' });
  const data = await normalize(db, { ...prev, ...input }, id);
  const record = { ...prev, ...data, status: input.status || prev.status, updated_at: stamp() };
  await categoriesRepository.update(db, record);
  return record;
}

export const archiveCategory = (db, id, archived = true) =>
  updateCategory(db, id, { status: archived ? 'archived' : 'active' });

export const getCategoryUsage = (db, id) => categoriesRepository.usage(db, id);

/**
 * Elimina definitivamente. Si hay movimientos, exige `reassignTo` (categoría
 * compatible) y los mueve en la misma transacción; presupuestos de la
 * categoría eliminada se borran, recurrencias se reasignan.
 */
export function deleteCategory(db, id, { reassignTo } = {}) {
  return db.transaction(async tx => {
    const cat = await categoriesRepository.get(tx, id);
    if (!cat) return false;
    const usage = await categoriesRepository.usage(tx, id);
    if (usage.transactions > 0 || usage.recurring > 0) {
      if (!reassignTo) {
        throw new ValidationError({
          reassignTo: `Tiene ${usage.transactions} movimientos. Archívala o elige a qué categoría moverlos.`,
        });
      }
      const target = await categoriesRepository.get(tx, reassignTo);
      if (!target || target.id === id) throw new ValidationError({ reassignTo: 'Categoría destino no válida' });
      if (cat.kind !== 'both' && target.kind !== 'both' && target.kind !== cat.kind) {
        throw new ValidationError({ reassignTo: 'La categoría destino es de otro tipo' });
      }
      await tx.run('UPDATE transactions SET category_id = ?, updated_at = ? WHERE category_id = ?', [reassignTo, stamp(), id]);
      await tx.run('UPDATE recurring_rules SET category_id = ? WHERE category_id = ?', [reassignTo, id]);
    }
    await categoriesRepository.delete(tx, id);
    return true;
  });
}

/** Siguiente color de la paleta que no esté en uso, para categorías nuevas. */
export async function suggestColor(db) {
  const rows = await db.all('SELECT color FROM categories');
  const used = new Set(rows.map(r => r.color.toUpperCase()));
  return CATEGORY_COLORS.find(c => !used.has(c.toUpperCase())) || CATEGORY_COLORS[rows.length % CATEGORY_COLORS.length];
}
