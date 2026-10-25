/**
 * INICIO — círculo financiero del periodo y resumen priorizado.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { BRAND } from '../config/brand';
import { colors, radii, spacing } from '../config/theme';
import { ROUTES } from '../navigation/routes';
import { useDb } from '../hooks/DatabaseProvider';
import { useQuery } from '../hooks/useQuery';
import { useSettings } from '../hooks/useSettings';
import { getPeriodSummary } from '../services/stats/summaryService';
import { getUpcoming } from '../services/stats/upcomingService';
import { getDailyAllowance } from '../services/stats/dailyAllowanceService';
import { listBudgetStatus } from '../services/budgets/budgetService';
import { frequentExpenses, duplicateTransaction } from '../services/transactions/transactionService';
import { transactionsRepository } from '../database/repositories/transactionsRepository';
import { checkImmediateAlerts, notifySafely } from '../services/notifications/notificationService';
import { describePeriod, getPeriod, PERIOD_LABELS, PERIOD_SPENDING_LABELS, shiftPeriod } from '../utils/periods';
import { formatDate, nowDateTime, relativeDays, todayISO } from '../utils/dates';
import { formatMoney } from '../utils/money';
import AppText from '../components/common/AppText';
import Card from '../components/common/Card';
import EmptyState from '../components/common/EmptyState';
import Icon from '../components/common/Icon';
import MoneyText from '../components/common/MoneyText';
import SectionHeader from '../components/common/SectionHeader';
import Screen from '../components/common/Screen';
import { useToast } from '../components/common/Toast';
import SpendingCircle from '../components/SpendingCircle';
import FloatingStatement from '../components/FloatingStatement';
import TransactionCard from '../components/TransactionCard';
import BudgetProgress from '../components/BudgetProgress';
import CategoryIcon from '../components/CategoryIcon';

async function loadHome(db, { periodSettings, period, remainingMode, cushion, frequencies, includeLater, incomeOnly }) {
  const [summary, upcoming, budgets, recent, frequent, daily] = await Promise.all([
    getPeriodSummary(db, { periodSettings, period, remainingMode }),
    getUpcoming(db, { days: 31 }),
    listBudgetStatus(db, periodSettings),
    transactionsRepository.search(db, {}, { limit: 5 }),
    frequentExpenses(db, 4),
    getDailyAllowance(db, { periodSettings, cushion, frequencies, includeLater, incomeOnly }),
  ]);
  return { summary, upcoming, budgets, recent, frequent, daily };
}

export default function INICIO({ navigation }) {
  const db = useDb();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { settings, periodSettings } = useSettings();
  const [offset, setOffset] = useState(0);
  const [statementOpen, setStatementOpen] = useState(false);

  const period = useMemo(() => {
    if (!periodSettings) return null;
    let p = getPeriod(todayISO(), periodSettings);
    for (let i = 0; i < Math.abs(offset); i++) p = shiftPeriod(p, offset < 0 ? -1 : 1, periodSettings);
    return p;
  }, [periodSettings, offset]);

  const { data, loading, reload } = useQuery(
    d => (period ? loadHome(d, { periodSettings, period, remainingMode: settings['circle.remainingBase'], cushion: settings['daily.cushion'], frequencies: settings['plan.frequency'], includeLater: settings['daily.includeLater'], incomeOnly: settings['daily.incomeOnly'] }) : Promise.resolve(null)),
    [period && period.start, period && period.end, settings && settings['circle.remainingBase'], settings && settings['daily.cushion'], settings && settings['plan.frequency'], settings && settings['daily.includeLater'], settings && settings['daily.incomeOnly']],
  );

  const openTx = useCallback(id => navigation.navigate(ROUTES.MOVIMIENTO_DETALLE, { id }), [navigation]);
  const addExpense = () => navigation.navigate(ROUTES.MOVIMIENTO_FORM, { kind: 'expense' });

  const repeat = async f => {
    const last = await transactionsRepository.findLatestSameExpense(db, f);
    if (!last) return;
    try {
      await duplicateTransaction(db, last.id, nowDateTime());
      toast(`Registrado: ${f.description || f.category_name} ${formatMoney(f.amount)}`);
      notifySafely(checkImmediateAlerts(db), toast);
    } catch (e) {
      toast(e.message, 'error');
    }
  };

  if (!settings || !period) return <Screen />;
  const summary = data && data.summary;
  const overview = data && data.upcoming.overview;
  const generalBudget = data && data.budgets.find(b => !b.category_id && b.period_type === period.type);

  return (
    <View style={styles.root}>
      <Screen padded topInset onRefresh={reload} refreshing={loading && !!data}>
        <View style={styles.top}>
          <View>
            <AppText variant="label" color={colors.teal}>{BRAND.shortName}</AppText>
            <AppText variant="title">Resumen</AppText>
          </View>
          <Pressable onPress={() => navigation.navigate(ROUTES.AJUSTES)} hitSlop={10} accessibilityLabel="Ajustes" style={styles.iconBtn}>
            <Icon name="settings" size={20} color={colors.textSecondary} />
          </Pressable>
        </View>

        <View style={styles.periodRow}>
          <Pressable onPress={() => setOffset(o => o - 1)} hitSlop={12} accessibilityLabel="Periodo anterior" style={styles.arrow}>
            <Icon name="chevron-left" size={20} color={colors.textSecondary} />
          </Pressable>
          <Pressable onPress={() => setOffset(0)} accessibilityLabel="Volver al periodo actual" style={styles.periodCenter}>
            <AppText variant="small" color={colors.text}>{describePeriod(period)}</AppText>
            <AppText variant="caption" color={colors.textMuted}>{PERIOD_LABELS[period.type]}{offset !== 0 ? ' · toca para volver a hoy' : ''}</AppText>
          </Pressable>
          <Pressable onPress={() => setOffset(o => o + 1)} hitSlop={12} accessibilityLabel="Periodo siguiente" style={styles.arrow} disabled={offset >= 0}>
            <Icon name="chevron-right" size={20} color={offset >= 0 ? colors.border : colors.textSecondary} />
          </Pressable>
        </View>

        {summary ? (
          <>
            <SpendingCircle
              label={PERIOD_SPENDING_LABELS[period.type]}
              spent={summary.spent}
              remaining={summary.remaining}
              segments={summary.segments}
              periodKey={period.start}
              onPress={() => setStatementOpen(true)}
            />
            {summary.segments.length ? (
              <Animated.View entering={FadeIn.delay(300)} style={styles.legend}>
                {summary.segments.slice(0, 5).map(s => (
                  <View key={s.categoryId} style={styles.legendItem}>
                    <View style={[styles.dot, { backgroundColor: s.color }]} />
                    <AppText variant="caption" color={colors.textSecondary}>{s.name} {s.percent}%</AppText>
                  </View>
                ))}
                {summary.segments.length > 5 ? <AppText variant="caption" color={colors.textMuted}>+{summary.segments.length - 5}</AppText> : null}
              </Animated.View>
            ) : (
              <AppText variant="small" color={colors.textSecondary} style={styles.centerText}>
                {overview && !overview.hasAccounts ? 'Empieza creando tus cuentas y registra tu primer gasto.' : 'Registra un gasto para ver cómo se reparte tu dinero.'}
              </AppText>
            )}
          </>
        ) : null}

        {overview && !overview.hasAccounts ? (
          <Card index={0} onPress={() => navigation.navigate(ROUTES.CUENTA_FORM)} style={styles.cta}>
            <Icon name="wallet" size={22} color={colors.teal} />
            <View style={styles.flex}>
              <AppText variant="subtitle">Crea tu primera cuenta</AppText>
              <AppText variant="caption" color={colors.textSecondary}>Efectivo, débito, ahorro o tarjeta de crédito, cada una con su saldo.</AppText>
            </View>
            <Icon name="chevron-right" size={18} color={colors.textMuted} />
          </Card>
        ) : null}

        {summary ? (
          <View style={styles.grid}>
            <Card index={1} style={styles.half} onPress={() => navigation.navigate(ROUTES.INGRESOS)} accessibilityLabel="Ingresos del periodo">
              <AppText variant="label" color={colors.textSecondary}>Ingresos</AppText>
              <MoneyText cents={summary.income} color={colors.positive} style={styles.mt} />
              <AppText variant="caption" color={colors.textMuted}>{summary.expectedIncome ? `+${formatMoney(summary.expectedIncome)} previstos` : 'recibidos en el periodo'}</AppText>
            </Card>
            <Card index={2} style={styles.half} onPress={() => setStatementOpen(true)} accessibilityLabel="Gastos del periodo">
              <AppText variant="label" color={colors.textSecondary}>Gastos</AppText>
              <MoneyText cents={summary.spent} style={styles.mt} />
              <AppText variant="caption" color={colors.textMuted}>{(n => (n ? `${n} gasto${n === 1 ? '' : 's'}` : 'sin gastos'))(summary.segments.reduce((s, x) => s + x.count, 0))}</AppText>
            </Card>
          </View>
        ) : null}

        {overview && overview.hasAccounts ? (
          <Card index={3} onPress={() => navigation.navigate(ROUTES.CUENTAS)} accessibilityLabel="Dinero disponible">
            <View style={styles.rowBetween}>
              <View style={styles.flex}>
                <AppText variant="label" color={colors.textSecondary}>Dinero disponible</AppText>
                <MoneyText cents={overview.available} variant="amountLg" color={overview.available < 0 ? colors.coral : colors.text} style={styles.mt} />
                <AppText variant="caption" color={colors.textMuted}>
                  Saldo líquido {formatMoney(overview.liquid)}
                  {overview.reserved ? ` · apartado ${formatMoney(overview.reserved)}` : ''}
                </AppText>
              </View>
              {overview.creditDebt ? (
                <View style={styles.debtBox}>
                  <AppText variant="caption" color={colors.textSecondary}>Deuda tarjetas</AppText>
                  <AppText variant="subtitle" color={colors.coral}>{formatMoney(overview.creditDebt, 'MXN', { showCents: false })}</AppText>
                </View>
              ) : null}
            </View>
          </Card>
        ) : null}

        {overview && overview.hasAccounts && data.daily ? <DailyCard daily={data.daily} onPress={() => navigation.navigate(ROUTES.GASTO_DIARIO)} /> : null}

        {data && (data.upcoming.nextPayment || data.upcoming.nextCardDue) ? (
          <View style={styles.grid}>
            {data.upcoming.nextPayment ? (
              <Card index={4} style={styles.half} onPress={() => openUpcoming(navigation, data.upcoming.nextPayment)}>
                <AppText variant="label" color={colors.textSecondary}>Próximo pago</AppText>
                <AppText variant="small" numberOfLines={1} style={styles.mt}>{data.upcoming.nextPayment.title}</AppText>
                <AppText variant="subtitle">{formatMoney(data.upcoming.nextPayment.amount)}</AppText>
                {data.upcoming.nextPayment.type === 'card_due' ? (
                  cardDueCaption(data.upcoming.nextPayment) ? <AppText variant="caption" color={colors.textMuted} numberOfLines={3}>{cardDueCaption(data.upcoming.nextPayment)}</AppText> : null
                ) : data.upcoming.nextPayment.amountIsEstimate ? <AppText variant="caption" color={colors.textMuted}>saldo pendiente (sin pago mensual registrado)</AppText> : null}
                <AppText variant="caption" color={colors.gold}>{relativeDays(data.upcoming.nextPayment.date, todayISO())} · {formatDate(data.upcoming.nextPayment.date, { withYear: false })}</AppText>
              </Card>
            ) : null}
            {data.upcoming.nextCardDue ? (
              <Card index={5} style={styles.half} onPress={() => navigation.navigate(ROUTES.CUENTA_DETALLE, { id: data.upcoming.nextCardDue.accountId })}>
                <AppText variant="label" color={colors.textSecondary}>Vence tarjeta</AppText>
                <AppText variant="small" numberOfLines={1} style={styles.mt}>{data.upcoming.nextCardDue.title.replace(/^Vence /, '')}</AppText>
                <AppText variant="subtitle">{formatMoney(data.upcoming.nextCardDue.amount)}</AppText>
                {cardDueCaption(data.upcoming.nextCardDue) ? <AppText variant="caption" color={colors.textMuted} numberOfLines={3}>{cardDueCaption(data.upcoming.nextCardDue)}</AppText> : null}
                <AppText variant="caption" color={colors.gold}>{relativeDays(data.upcoming.nextCardDue.date, todayISO())}</AppText>
              </Card>
            ) : null}
          </View>
        ) : null}

        {generalBudget ? (
          <Card index={6} onPress={() => navigation.navigate(ROUTES.PRESUPUESTOS)}>
            <BudgetProgress budget={generalBudget} title="Presupuesto del periodo" />
          </Card>
        ) : null}

        {summary && summary.topCategory ? (
          <Card index={7} onPress={() => setStatementOpen(true)} style={styles.topCat}>
            <CategoryIcon icon={summary.topCategory.icon} color={summary.topCategory.color} />
            <View style={styles.flex}>
              <AppText variant="label" color={colors.textSecondary}>Mayor gasto</AppText>
              <AppText variant="subtitle">{summary.topCategory.name}</AppText>
            </View>
            <View style={styles.right}>
              <AppText variant="subtitle">{formatMoney(summary.topCategory.amount)}</AppText>
              <AppText variant="caption" color={colors.textSecondary}>{summary.topCategory.percent}% del gasto</AppText>
            </View>
          </Card>
        ) : null}

        {data && data.frequent.length ? (
          <>
            <SectionHeader title="Repetir gasto frecuente" />
            <View style={styles.freqRow}>
              {data.frequent.map(f => (
                <Pressable key={`${f.category_id}-${f.account_id}-${f.amount}-${f.description}`} onPress={() => repeat(f)} style={({ pressed }) => [styles.freq, pressed && { opacity: 0.7 }]} accessibilityLabel={`Repetir ${f.description || f.category_name} por ${formatMoney(f.amount)}`}>
                  <CategoryIcon icon={f.category_icon} color={f.category_color} size={28} />
                  <View style={styles.freqText}>
                    <AppText variant="caption" numberOfLines={1}>{f.description || f.category_name}</AppText>
                    <AppText variant="caption" color={colors.textSecondary}>{formatMoney(f.amount)}</AppText>
                  </View>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        <SectionHeader title="Últimos movimientos" action={data && data.recent.length ? 'Ver todos' : null} onAction={() => navigation.navigate(ROUTES.MOVIMIENTOS)} />
        {data && data.recent.length ? (
          <Card index={8} style={styles.listCard}>
            {data.recent.map(t => <TransactionCard key={t.id} tx={t} onPress={() => openTx(t.id)} />)}
          </Card>
        ) : data ? (
          <EmptyState compact icon="receipt" title="Aún no hay movimientos" message="Tus gastos, ingresos y transferencias aparecerán aquí." />
        ) : null}
        <View style={{ height: 80 }} />
      </Screen>

      <Animated.View entering={ZoomIn.delay(250)} style={[styles.fab, { bottom: spacing.lg }]}>
        <Pressable onPress={addExpense} accessibilityRole="button" accessibilityLabel="Añadir gasto" style={({ pressed }) => [styles.fabInner, pressed && { transform: [{ scale: 0.95 }] }]}>
          <Icon name="plus" size={22} color="#0B1A17" strokeWidth={2.4} />
          <AppText variant="subtitle" color="#0B1A17" style={styles.fabText}>Gasto</AppText>
        </Pressable>
      </Animated.View>

      <FloatingStatement visible={statementOpen} onClose={() => setStatementOpen(false)} summary={summary} onOpenTransaction={openTx} />
      <View style={{ height: insets.bottom }} />
    </View>
  );
}

/** "Hoy puedes gastar": lo del día, lo que llevas y cómo va (verde, amarillo, rojo). */
function DailyCard({ daily: d, onPress }) {
  const ratio = d.allowance > 0 ? d.spentToday / d.allowance : d.spentToday > 0 ? 1.01 : 0;
  const tone = ratio > 1 ? colors.coral : ratio >= 0.75 ? colors.gold : colors.teal;
  const until = d.horizonSource === 'income' ? `hasta tu ingreso del ${formatDate(d.horizon, { withYear: false })}` : 'hasta el fin del periodo';
  let detail;
  if (d.shortfall > 0) detail = `Te faltan ${formatMoney(d.shortfall)} para tus pagos ${until}`;
  else if (d.leftToday < 0) detail = `Te pasaste ${formatMoney(-d.leftToday)} · mañana ${formatMoney(d.tomorrowAllowance ?? 0)}`;
  else if (d.spentToday > 0) detail = `Llevas ${formatMoney(d.spentToday)} · te quedan ${formatMoney(d.leftToday)}`;
  else detail = `${d.days} ${d.days === 1 ? 'día' : 'días'} ${until}`;
  return (
    <Card index={3} onPress={onPress} accessibilityLabel={`Hoy puedes gastar ${formatMoney(d.allowance)}. ${detail}`} style={styles.dailyCard}>
      <View style={styles.rowBetween}>
        <View style={styles.flexStart}>
          <AppText variant="label" color={colors.textSecondary}>Hoy puedes gastar</AppText>
          <MoneyText cents={d.allowance} variant="amountLg" color={d.allowance > 0 ? colors.text : colors.coral} style={styles.mt} />
        </View>
        <Icon name="chevron-right" size={18} color={colors.textMuted} />
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.min(100, Math.round(ratio * 100))}%`, backgroundColor: tone }]} />
      </View>
      <AppText variant="caption" color={d.shortfall > 0 || d.leftToday < 0 ? colors.coral : colors.textMuted} style={styles.mt}>{detail}</AppText>
      {d.pendingIncome ? <AppText variant="caption" color={colors.gold}>Confirma tu ingreso del {formatDate(d.pendingIncome.date, { withYear: false })} para que cuente</AppText> : null}
    </Card>
  );
}

function openUpcoming(navigation, item) {
  if (item.type === 'debt_due') navigation.navigate(ROUTES.DEUDA_DETALLE, { id: item.debtId });
  else if (item.type === 'card_due') navigation.navigate(ROUTES.CUENTA_DETALLE, { id: item.accountId });
  else navigation.navigate(ROUTES.INGRESOS);
}

/** Desglose del pago de una tarjeta con financiaciones; sin ellas el importe ya es su deuda. */
function cardDueCaption(item) {
  const b = item.breakdown;
  if (!b || !b.plansCount) return null;
  const text = `${formatMoney(b.revolving)} sin financiar + ${formatMoney(b.monthlyDue)} de mensualidades`;
  if (!b.plansWithoutMonthly) return text;
  return `${text} · falta el pago mensual de ${b.plansWithoutMonthly} ${b.plansWithoutMonthly === 1 ? 'plan' : 'planes'}`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  periodRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  arrow: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  periodCenter: { alignItems: 'center', minWidth: 180 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.md, marginBottom: spacing.lg },
  legendItem: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  centerText: { textAlign: 'center', marginBottom: spacing.lg },
  grid: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  half: { flex: 1 },
  mt: { marginTop: 6 },
  rowBetween: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1, marginHorizontal: spacing.md },
  debtBox: { alignItems: 'flex-end' },
  dailyCard: { marginTop: spacing.md, marginBottom: spacing.md },
  flexStart: { flex: 1 },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.ringTrack, marginTop: spacing.md, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  cta: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md, borderColor: colors.teal },
  topCat: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md },
  right: { alignItems: 'flex-end' },
  freqRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  freq: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radii.md, padding: spacing.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, width: '48.5%' },
  freqText: { marginLeft: spacing.sm, flex: 1 },
  listCard: { paddingVertical: spacing.xs },
  fab: { position: 'absolute', right: spacing.lg },
  fabInner: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.teal, borderRadius: radii.pill, paddingHorizontal: spacing.xl, height: 54, elevation: 6, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  fabText: { marginLeft: spacing.sm },
});
