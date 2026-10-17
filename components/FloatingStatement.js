import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { colors, radii, spacing } from '../config/theme';
import { periodStatement } from '../services/stats/summaryService';
import { describePeriod } from '../utils/periods';
import { formatMoney } from '../utils/money';
import { useQuery } from '../hooks/useQuery';
import AppText from './common/AppText';
import EmptyState from './common/EmptyState';
import ProgressBar from './common/ProgressBar';
import Sheet from './common/Sheet';
import CategoryIcon from './CategoryIcon';
import TransactionCard from './TransactionCard';

/**
 * Estado de cuenta del periodo: total, desglose por categoría (toca para
 * filtrar) y movimientos reales. Toca un movimiento para verlo/editarlo.
 */
export default function FloatingStatement({ visible, onClose, summary, onOpenTransaction }) {
  const [categoryId, setCategoryId] = useState(null);
  const period = summary && summary.period;
  const { data: rows = [] } = useQuery(
    db => (visible && period ? periodStatement(db, period, { categoryId }) : Promise.resolve([])),
    [visible, period && period.start, period && period.end, categoryId],
  );
  const selected = useMemo(() => summary && summary.segments.find(s => s.categoryId === categoryId), [summary, categoryId]);
  if (!summary) return null;
  const close = () => {
    setCategoryId(null);
    onClose();
  };
  return (
    <Sheet visible={visible} onClose={close} title="Estado de cuenta">
      <View style={styles.header}>
        <AppText variant="caption" color={colors.textSecondary}>{describePeriod(summary.period)}</AppText>
        <AppText variant="amountLg" style={styles.total}>{formatMoney(selected ? selected.amount : summary.spent)}</AppText>
        <AppText variant="caption" color={colors.textMuted}>
          {selected ? `${selected.name} · ${selected.percent}% del gasto` : `Gasto neto${summary.refunds ? ` (incluye ${formatMoney(summary.refunds)} en devoluciones)` : ''}`}
        </AppText>
      </View>

      {summary.segments.length ? (
        <View style={styles.cats}>
          {summary.segments.map(s => {
            const active = s.categoryId === categoryId;
            return (
              <Pressable
                key={s.categoryId}
                onPress={() => setCategoryId(active ? null : s.categoryId)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${s.name}, ${formatMoney(s.amount)}, ${s.percent} por ciento${active ? ', filtro activo' : ''}`}
                style={[styles.cat, active && { borderColor: s.color, backgroundColor: s.color + '14' }]}>
                <CategoryIcon icon={s.icon} color={s.color} size={32} archived={s.archived} />
                <View style={styles.catMid}>
                  <View style={styles.catTop}>
                    <AppText variant="small" numberOfLines={1} style={styles.flex}>{s.name}{s.archived ? ' (archivada)' : ''}</AppText>
                    <AppText variant="small" style={styles.num}>{formatMoney(s.amount)}</AppText>
                  </View>
                  <View style={styles.catBottom}>
                    <View style={styles.flex}><ProgressBar value={s.percent / 100} color={s.color} height={4} /></View>
                    <AppText variant="caption" color={colors.textSecondary} style={styles.pct}>{s.percent}%</AppText>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <View style={styles.listHeader}>
        <AppText variant="label" color={colors.textSecondary}>{selected ? `Movimientos · ${selected.name}` : 'Movimientos'}</AppText>
        {categoryId ? (
          <Pressable onPress={() => setCategoryId(null)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Ver todos los movimientos"><AppText variant="small" color={colors.teal}>Ver todos</AppText></Pressable>
        ) : null}
      </View>
      {rows.length ? (
        <Animated.View layout={LinearTransition}>
          {rows.map(t => (
            <Animated.View key={t.id} entering={FadeIn.duration(200)}>
              <TransactionCard tx={t} compact onPress={() => { close(); onOpenTransaction(t.id); }} />
            </Animated.View>
          ))}
        </Animated.View>
      ) : (
        <EmptyState compact icon="receipt" title="Sin movimientos" message="Los gastos que registres en este periodo aparecerán aquí." />
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', paddingVertical: spacing.md },
  total: { marginVertical: 4 },
  cats: { marginTop: spacing.sm },
  cat: { flexDirection: 'row', alignItems: 'center', padding: spacing.sm, borderRadius: radii.md, borderWidth: 1, borderColor: 'transparent', marginBottom: 4 },
  catMid: { flex: 1, marginLeft: spacing.md },
  catTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  catBottom: { flexDirection: 'row', alignItems: 'center' },
  pct: { width: 44, textAlign: 'right' },
  flex: { flex: 1 },
  num: { fontVariant: ['tabular-nums'], marginLeft: spacing.sm },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.lg, marginBottom: spacing.xs },
});
