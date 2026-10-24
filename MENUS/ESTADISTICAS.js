/**
 * ESTADISTICAS — análisis derivados de los movimientos reales. El rango de
 * fechas elegido afecta a todos los gráficos.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, spacing } from '../config/theme';
import { ROUTES } from '../navigation/routes';
import { useQuery } from '../hooks/useQuery';
import { transactionsRepository } from '../database/repositories/transactionsRepository';
import { buildSegments } from '../services/stats/summaryService';
import { debtEvolution, seriesForRange } from '../services/stats/statsService';
import { getUpcoming } from '../services/stats/upcomingService';
import { listGoals } from '../services/goals/goalService';
import { addDays, addMonths, diffDays, formatDate, monthShort, startOfMonth, todayISO } from '../utils/dates';
import { formatMoney, ratioPercent } from '../utils/money';
import AppText from '../components/common/AppText';
import Card from '../components/common/Card';
import DateTimeField from '../components/common/DateTimeField';
import EmptyState from '../components/common/EmptyState';
import ListRow from '../components/common/ListRow';
import ProgressBar from '../components/common/ProgressBar';
import Screen from '../components/common/Screen';
import SectionHeader from '../components/common/SectionHeader';
import Segmented from '../components/common/Segmented';
import BarChart from '../components/charts/BarChart';
import LineChart from '../components/charts/LineChart';
import CategoryIcon from '../components/CategoryIcon';

const RANGES = [
  { value: '7d', label: '7 días' },
  { value: 'month', label: 'Mes' },
  { value: '3m', label: '3 meses' },
  { value: 'year', label: 'Año' },
  { value: 'custom', label: 'Otro' },
];

function rangeFor(key, custom) {
  const today = todayISO();
  const end = addDays(today, 1);
  switch (key) {
    case '7d':
      return { from: addDays(end, -7), to: end };
    case 'month':
      return { from: startOfMonth(today), to: end };
    case '3m':
      return { from: addMonths(startOfMonth(today), -2), to: end };
    case 'year':
      return { from: `${today.slice(0, 4)}-01-01`, to: end };
    default:
      return { from: custom.from, to: addDays(custom.to, 1) };
  }
}

function bucketLabel(bucket, date) {
  if (bucket === 'month') return monthShort(date);
  return formatDate(date, { withYear: false });
}

async function load(db, { from, to }) {
  const len = Math.max(1, diffDays(from, to));
  const prevFrom = addDays(from, -len);
  const [cats, totals, prevTotals, series, debts, upcoming, goals] = await Promise.all([
    transactionsRepository.spendingByCategory(db, from, to),
    transactionsRepository.totals(db, from, to),
    transactionsRepository.totals(db, prevFrom, from),
    seriesForRange(db, from, to),
    debtEvolution(db, from, to),
    getUpcoming(db, { days: 31 }),
    listGoals(db),
  ]);
  return { segments: buildSegments(cats), totals, prevTotals, series, debts, upcoming: upcoming.items.filter(i => i.type !== 'expected_income').slice(0, 6), goals, len };
}

export default function ESTADISTICAS({ navigation }) {
  const [rangeKey, setRangeKey] = useState('month');
  const [custom, setCustom] = useState({ from: addDays(todayISO(), -30), to: todayISO() });
  const range = useMemo(() => rangeFor(rangeKey, custom), [rangeKey, custom]);
  const { data, loading, reload } = useQuery(db => load(db, range), [range.from, range.to]);

  const spent = data ? Math.max(0, data.totals.net_spending) : 0;
  const prevSpent = data ? Math.max(0, data.prevTotals.net_spending) : 0;
  const change = spent - prevSpent;
  const hasData = data && data.totals.count > 0;

  return (
    <Screen onRefresh={reload} refreshing={loading && !!data}>
      <Segmented options={RANGES} value={rangeKey} onChange={setRangeKey} />
      {rangeKey === 'custom' ? (
        <View style={styles.row}>
          <View style={styles.flex}><DateTimeField label="Desde" mode="date" value={custom.from} onChange={from => setCustom(c => ({ ...c, from: from <= c.to ? from : c.to }))} /></View>
          <View style={styles.flex}><DateTimeField label="Hasta" mode="date" value={custom.to} onChange={to => setCustom(c => ({ ...c, to: to >= c.from ? to : c.from }))} /></View>
        </View>
      ) : null}
      <AppText variant="caption" color={colors.textSecondary} style={styles.rangeText}>
        {formatDate(range.from)} – {formatDate(addDays(range.to, -1))}
      </AppText>

      {!data ? null : !hasData ? (
        <EmptyState
          icon="chart"
          title="Aún no hay datos en este rango"
          message="Las estadísticas se calculan con tus movimientos registrados. Registra gastos e ingresos o importa un CSV para ver tendencias, comparaciones y categorías."
          actionLabel="Registrar un gasto"
          onAction={() => navigation.navigate(ROUTES.MOVIMIENTO_FORM, { kind: 'expense' })}
        />
      ) : (
        <>
          <View style={styles.grid}>
            <Card index={0} style={styles.flex}>
              <AppText variant="label" color={colors.textSecondary}>Gasto neto</AppText>
              <AppText variant="amount" style={styles.mt}>{formatMoney(spent)}</AppText>
              <AppText variant="caption" color={!prevSpent ? colors.textSecondary : change > 0 ? colors.coral : colors.teal}>
                {prevSpent ? `${change > 0 ? '▲' : '▼'} ${formatMoney(Math.abs(change))} (${ratioPercent(Math.abs(change), prevSpent)}%)` : 'sin periodo anterior'}
              </AppText>
            </Card>
            <Card index={1} style={styles.flex}>
              <AppText variant="label" color={colors.textSecondary}>Ingresos</AppText>
              <AppText variant="amount" color={colors.positive} style={styles.mt}>{formatMoney(data.totals.income)}</AppText>
              <AppText variant="caption" color={colors.textSecondary}>Balance {formatMoney(data.totals.income - spent, 'MXN', { sign: true })}</AppText>
            </Card>
          </View>
          <AppText variant="caption" color={colors.textMuted}>Comparado con los {data.len} días anteriores. Transferencias y pagos de tarjeta no cuentan como gasto.</AppText>

          <SectionHeader title="Gasto por categoría" />
          <Card index={2}>
            {data.segments.length ? data.segments.map(s => (
              <View key={s.categoryId} style={styles.catRow}>
                <CategoryIcon icon={s.icon} color={s.color} size={30} archived={s.archived} />
                <View style={styles.catMid}>
                  <View style={styles.between}>
                    <AppText variant="small" numberOfLines={1} style={styles.flex}>{s.name}</AppText>
                    <AppText variant="small">{formatMoney(s.amount)}</AppText>
                  </View>
                  <View style={styles.between}>
                    <View style={styles.flex}><ProgressBar value={s.percent / 100} color={s.color} height={5} /></View>
                    <AppText variant="caption" color={colors.textSecondary} style={styles.pct}>{s.percent}%</AppText>
                  </View>
                </View>
              </View>
            )) : <AppText color={colors.textSecondary}>Sin gastos en este rango.</AppText>}
          </Card>

          <SectionHeader title={`Evolución del gasto (${{ day: 'diario', week: 'semanal', month: 'mensual' }[data.series.bucket]})`} />
          <Card index={3}>
            <BarChart data={data.series.points.map(p => ({ label: bucketLabel(data.series.bucket, p.date), values: [Math.max(0, p.spending)] }))} series={[{ color: colors.violet, name: 'Gasto' }]} highlightLast />
          </Card>

          <SectionHeader title="Ingresos frente a gastos" />
          <Card index={4}>
            <BarChart
              data={data.series.points.map(p => ({ label: bucketLabel(data.series.bucket, p.date), values: [p.income, Math.max(0, p.spending)] }))}
              series={[{ color: colors.teal, name: 'Ingresos' }, { color: colors.coral, name: 'Gastos' }]}
            />
          </Card>
        </>
      )}

      {data && data.debts.length ? (
        <>
          <SectionHeader title="Evolución de deudas" />
          <Card>
            <LineChart points={data.debts.map(p => ({ label: formatDate(p.date, { withYear: false }), value: p.value }))} color={colors.coral} />
            <AppText variant="caption" color={colors.textMuted} style={styles.mt}>Saldo pendiente total de financiaciones según conciliaciones y pagos registrados.</AppText>
          </Card>
        </>
      ) : null}

      {data && data.upcoming.length ? (
        <>
          <SectionHeader title="Pagos próximos (31 días)" />
          <Card style={styles.list}>
            {data.upcoming.map((u, i) => (
              <ListRow key={`${u.type}-${u.date}-${i}`} icon={u.type === 'card_due' ? 'card' : u.type === 'debt_due' ? 'receipt' : 'repeat'} iconColor={colors.gold} title={u.title} subtitle={`${formatDate(u.date, { withWeekday: true })}${u.breakdown && u.breakdown.plansCount ? ` · incluye ${formatMoney(u.breakdown.monthlyDue)} de mensualidades` : ''}`} right={formatMoney(u.amount)} last={i === data.upcoming.length - 1} />
            ))}
          </Card>
        </>
      ) : null}

      {data && data.goals.length ? (
        <>
          <SectionHeader title="Metas de ahorro" action="Ver" onAction={() => navigation.navigate(ROUTES.METAS)} />
          <Card>
            {data.goals.map(g => (
              <View key={g.id} style={styles.goal}>
                <View style={styles.between}>
                  <AppText variant="small">{g.name}</AppText>
                  <AppText variant="caption" color={colors.textSecondary}>{formatMoney(g.saved)} / {formatMoney(g.target_amount)}</AppText>
                </View>
                <ProgressBar value={g.saved / g.target_amount} color={g.color || colors.teal} height={6} />
              </View>
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  flex: { flex: 1 },
  rangeText: { marginTop: spacing.sm, marginBottom: spacing.md, textAlign: 'center' },
  grid: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.sm },
  mt: { marginTop: 6 },
  catRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  catMid: { flex: 1, marginLeft: spacing.md, gap: 6 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pct: { width: 46, textAlign: 'right' },
  list: { paddingVertical: spacing.xs },
  goal: { marginBottom: spacing.md, gap: 6 },
});
