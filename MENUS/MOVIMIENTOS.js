/**
 * MOVIMIENTOS — historial completo con búsqueda, filtros combinables y
 * carga progresiva (paginación sobre SQLite).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { colors, radii, spacing } from '../config/theme';
import { ROUTES } from '../navigation/routes';
import { useDb } from '../hooks/DatabaseProvider';
import { useQuery } from '../hooks/useQuery';
import { transactionsRepository } from '../database/repositories/transactionsRepository';
import { accountsRepository } from '../database/repositories/accountsRepository';
import { categoriesRepository } from '../database/repositories/categoriesRepository';
import { KIND_LABELS, PAYMENT_METHOD_LABELS } from '../services/transactions/rules';
import { addDays, formatDate } from '../utils/dates';
import { formatMoney } from '../utils/money';
import AmountField from '../components/common/AmountField';
import AppText from '../components/common/AppText';
import Button from '../components/common/Button';
import Chip from '../components/common/Chip';
import DateTimeField from '../components/common/DateTimeField';
import EmptyState from '../components/common/EmptyState';
import Icon from '../components/common/Icon';
import SelectField from '../components/common/SelectField';
import Sheet from '../components/common/Sheet';
import TransactionCard from '../components/TransactionCard';

const PAGE = 40;

function Separator() {
  return <View style={styles.sep} />;
}
const EMPTY_FILTERS = { kinds: [], categoryIds: [], accountId: null, paymentMethod: null, from: null, to: null, minAmount: null, maxAmount: null };

function toQuery(text, f) {
  return {
    text: text.trim() || undefined,
    kinds: f.kinds,
    categoryIds: f.categoryIds,
    accountId: f.accountId || undefined,
    paymentMethod: f.paymentMethod || undefined,
    from: f.from || undefined,
    to: f.to ? addDays(f.to, 1) : undefined,
    minAmount: Number.isInteger(f.minAmount) ? f.minAmount : undefined,
    maxAmount: Number.isInteger(f.maxAmount) ? f.maxAmount : undefined,
  };
}

export default function MOVIMIENTOS({ navigation, route }) {
  const db = useDb();
  const [text, setText] = useState('');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [draft, setDraft] = useState(EMPTY_FILTERS);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const seq = useRef(0);
  const { data: lookups } = useQuery(async d => ({ accounts: await accountsRepository.list(d, { includeArchived: true }), categories: await categoriesRepository.list(d, { includeArchived: true }) }), []);

  useEffect(() => {
    const p = route.params || {};
    if (p.accountId || p.categoryId) {
      const f = { ...EMPTY_FILTERS, accountId: p.accountId || null, categoryIds: p.categoryId ? [p.categoryId] : [] };
      setFilters(f);
      setDraft(f);
    }
  }, [route.params]);

  const query = useMemo(() => toQuery(text, filters), [text, filters]);

  const loadPage = useCallback(
    async reset => {
      const id = ++seq.current;
      setLoading(true);
      const offset = reset ? 0 : rows.length;
      const [page, count] = await Promise.all([
        transactionsRepository.search(db, query, { limit: PAGE, offset }),
        reset ? transactionsRepository.count(db, query) : Promise.resolve(null),
      ]);
      if (id !== seq.current) return;
      setRows(r => (reset ? page : [...r, ...page]));
      if (count !== null) setTotal(count);
      setDone(page.length < PAGE);
      setLoading(false);
    },
    [db, query, rows.length],
  );

  // Recarga al cambiar búsqueda/filtros (con pequeña espera al escribir) o la BD.
  useEffect(() => {
    const t = setTimeout(() => loadPage(true), 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);
  useEffect(() => db.subscribe(() => loadPage(true)), [db, loadPage]);

  const activeCount =
    filters.kinds.length + filters.categoryIds.length + (filters.accountId ? 1 : 0) + (filters.paymentMethod ? 1 : 0) +
    (filters.from || filters.to ? 1 : 0) + (Number.isInteger(filters.minAmount) || Number.isInteger(filters.maxAmount) ? 1 : 0);

  const toggle = (key, value) => setDraft(d => ({ ...d, [key]: d[key].includes(value) ? d[key].filter(x => x !== value) : [...d[key], value] }));

  return (
    <View style={styles.root}>
      <View style={styles.searchRow}>
        <View style={styles.search}>
          <Icon name="search" size={18} color={colors.textMuted} />
          <TextInput value={text} onChangeText={setText} placeholder="Buscar descripción, fuente o etiqueta" placeholderTextColor={colors.textMuted} style={styles.input} accessibilityLabel="Buscar movimientos" selectionColor={colors.teal} />
          {text ? <Pressable onPress={() => setText('')} hitSlop={10} accessibilityLabel="Borrar búsqueda"><Icon name="close" size={16} color={colors.textMuted} /></Pressable> : null}
        </View>
        <Pressable onPress={() => { setDraft(filters); setOpen(true); }} style={[styles.filterBtn, activeCount && styles.filterActive]} accessibilityLabel={`Filtros${activeCount ? `, ${activeCount} activos` : ''}`}>
          <Icon name="filter" size={18} color={activeCount ? colors.teal : colors.textSecondary} />
          {activeCount ? <AppText variant="caption" color={colors.teal} style={styles.badge}>{activeCount}</AppText> : null}
        </Pressable>
      </View>
      <View style={styles.metaRow}>
        <AppText variant="caption" color={colors.textSecondary}>{total} movimiento{total === 1 ? '' : 's'}</AppText>
        {activeCount || text ? <Pressable onPress={() => { setText(''); setFilters(EMPTY_FILTERS); setDraft(EMPTY_FILTERS); }} hitSlop={14} accessibilityRole="button" accessibilityLabel="Restablecer filtros"><AppText variant="caption" color={colors.teal}>Restablecer</AppText></Pressable> : null}
      </View>
      <FlatList
        data={rows}
        keyExtractor={t => t.id}
        renderItem={({ item }) => <TransactionCard tx={item} accountId={filters.accountId} onPress={() => navigation.navigate(ROUTES.MOVIMIENTO_DETALLE, { id: item.id })} />}
        ItemSeparatorComponent={Separator}
        contentContainerStyle={styles.list}
        onEndReached={() => !loading && !done && loadPage(false)}
        onEndReachedThreshold={0.4}
        initialNumToRender={15}
        windowSize={9}
        removeClippedSubviews
        ListEmptyComponent={
          loading ? null : (
            <EmptyState
              icon="list"
              title={activeCount || text ? 'Sin resultados' : 'Aún no hay movimientos'}
              message={activeCount || text ? 'Prueba con otros filtros.' : 'Registra tu primer gasto o importa un CSV de tu banco.'}
              actionLabel={activeCount || text ? undefined : 'Registrar movimiento'}
              onAction={() => navigation.navigate(ROUTES.MOVIMIENTO_FORM, { kind: 'expense' })}
            />
          )
        }
        ListFooterComponent={loading ? <ActivityIndicator color={colors.teal} style={styles.loader} /> : <View style={{ height: 90 }} />}
      />
      <Pressable onPress={() => navigation.navigate(ROUTES.MOVIMIENTO_FORM, { kind: 'expense' })} style={styles.fab} accessibilityRole="button" accessibilityLabel="Nuevo movimiento">
        <Icon name="plus" size={24} color="#0B1A17" strokeWidth={2.4} />
      </Pressable>

      <Sheet
        visible={open}
        onClose={() => setOpen(false)}
        title="Filtros"
        footer={
          <View style={styles.footer}>
            <Button title="Limpiar" variant="secondary" style={styles.flex} onPress={() => setDraft(EMPTY_FILTERS)} />
            <Button title="Aplicar" style={styles.flex} onPress={() => { setFilters(draft); setOpen(false); }} />
          </View>
        }>
        <AppText variant="caption" color={colors.textSecondary} style={styles.label}>Tipo de operación</AppText>
        <View style={styles.wrap}>
          {Object.entries(KIND_LABELS).map(([k, l]) => <Chip key={k} label={l} selected={draft.kinds.includes(k)} onPress={() => toggle('kinds', k)} />)}
        </View>
        <AppText variant="caption" color={colors.textSecondary} style={styles.label}>Categorías</AppText>
        <View style={styles.wrap}>
          {(lookups ? lookups.categories : []).map(c => <Chip key={c.id} label={c.name + (c.status === 'archived' ? ' (arch.)' : '')} dot={c.color} color={c.color} selected={draft.categoryIds.includes(c.id)} onPress={() => toggle('categoryIds', c.id)} />)}
        </View>
        <SelectField label="Cuenta" value={draft.accountId || ''} onChange={v => setDraft(d => ({ ...d, accountId: v || null }))} options={[{ value: '', label: 'Todas' }, ...(lookups ? lookups.accounts : []).map(a => ({ value: a.id, label: a.name }))]} />
        <SelectField label="Método de pago" value={draft.paymentMethod || ''} onChange={v => setDraft(d => ({ ...d, paymentMethod: v || null }))} options={[{ value: '', label: 'Todos' }, ...Object.entries(PAYMENT_METHOD_LABELS).map(([v, l]) => ({ value: v, label: l }))]} />
        <View style={styles.row}>
          <View style={styles.flex}><DateTimeField label="Desde" mode="date" value={draft.from} onChange={from => setDraft(d => ({ ...d, from }))} optional onClear={() => setDraft(d => ({ ...d, from: null }))} /></View>
          <View style={styles.flex}><DateTimeField label="Hasta" mode="date" value={draft.to} onChange={to => setDraft(d => ({ ...d, to }))} optional onClear={() => setDraft(d => ({ ...d, to: null }))} /></View>
        </View>
        <View style={styles.row}>
          <View style={styles.flex}><AmountField label="Importe mínimo" value={draft.minAmount} onChange={minAmount => setDraft(d => ({ ...d, minAmount }))} /></View>
          <View style={styles.flex}><AmountField label="Importe máximo" value={draft.maxAmount} onChange={maxAmount => setDraft(d => ({ ...d, maxAmount }))} /></View>
        </View>
        {draft.from || draft.to ? <AppText variant="caption" color={colors.textMuted}>{draft.from ? formatDate(draft.from) : 'Inicio'} – {draft.to ? formatDate(draft.to) : 'hoy'}</AppText> : null}
        {Number.isInteger(draft.minAmount) && Number.isInteger(draft.maxAmount) && draft.minAmount > draft.maxAmount ? <AppText variant="caption" color={colors.coral}>El mínimo ({formatMoney(draft.minAmount)}) supera al máximo.</AppText> : null}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  searchRow: { flexDirection: 'row', paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm },
  search: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radii.md, paddingHorizontal: spacing.md, height: 46, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  input: { flex: 1, color: colors.text, marginLeft: spacing.sm, fontSize: 15 },
  filterBtn: { width: 46, height: 46, borderRadius: radii.md, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  filterActive: { borderColor: colors.teal },
  badge: { position: 'absolute', top: 4, right: 7, fontSize: 10 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  list: { paddingHorizontal: spacing.lg },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  loader: { marginVertical: spacing.xl },
  fab: { position: 'absolute', right: spacing.lg, bottom: spacing.lg, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center', elevation: 6 },
  label: { marginBottom: spacing.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
  footer: { flexDirection: 'row', gap: spacing.md },
});
