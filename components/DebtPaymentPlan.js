import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { addDays, formatDate, todayISO } from '../utils/dates';
import { assessPlan, compareInstallmentPlans, comparePlans, pendingInstallments, planFromAmount } from '../services/debts/recommender';
import { colors, spacing } from '../config/theme';
import { formatMoney } from '../utils/money';
import AppText from './common/AppText';
import AmountField from './common/AmountField';
import Button from './common/Button';
import Card from './common/Card';
import DateTimeField from './common/DateTimeField';
import Segmented from './common/Segmented';

const FREQUENCY_OPTIONS = [
  { value: 'weekly', label: 'Semanal' },
  { value: 'biweekly', label: 'Quincenal' },
  { value: 'monthly', label: 'Mensual' },
];

const GOAL_OPTIONS = [
  { value: 'installments', label: 'Mensualidades' },
  { value: 'deadline', label: 'Liquidar antes' },
];

const safeAmount = value => (Number.isSafeInteger(value) ? value : 0);

function Amount({ label, value, color = colors.text, variant = 'amount' }) {
  return (
    <View style={styles.metric}>
      <AppText variant="caption" color={colors.textSecondary}>{label}</AppText>
      <AppText
        variant={variant}
        color={color}
        accessibilityLabel={`${label}: ${formatMoney(value)}`}>
        {formatMoney(value)}
      </AppText>
    </View>
  );
}

const MAX_ROWS = 12;

function Schedule({ schedule }) {
  const shown = schedule.slice(0, MAX_ROWS);
  return (
    <View style={styles.schedule}>
      {shown.map((item, index) => (
        <View key={`${item.date}-${index}`} style={styles.scheduleRow}>
          <AppText variant="small">{formatDate(item.date, { withWeekday: true })}</AppText>
          <AppText
            variant="amount"
            accessibilityLabel={`${formatDate(item.date)}: ${formatMoney(item.amount)}`}>
            {formatMoney(item.amount)}
          </AppText>
        </View>
      ))}
      {schedule.length > MAX_ROWS ? (
        <AppText variant="caption" color={colors.textSecondary} style={styles.more}>
          y {schedule.length - MAX_ROWS} aportaciones más hasta el {formatDate(schedule[schedule.length - 1].date)}
        </AppText>
      ) : null}
    </View>
  );
}

export default function DebtPaymentPlan({ debt, today, context, onRegisterPayment, onReserve, initialFrequency = 'monthly', onFrequencyChange }) {
  const currentDay = today || todayISO();
  const outstanding = safeAmount(debt.outstanding);
  const reserved = safeAmount(debt.reserved);
  const paidTotal = safeAmount(debt.paid_total);
  // Mensualidades capturadas (pago fijo o calendario): cada una se reparte antes de su fecha.
  const installments = useMemo(() => pendingInstallments(debt), [debt]);
  const lastInstallment = installments ? installments[installments.length - 1].date : null;
  const initialDeadline = lastInstallment || debt.effectiveDueDate || addDays(currentDay, 30);
  const [goal, setGoal] = useState(installments ? 'installments' : 'deadline');
  const byInstallments = goal === 'installments' && !!installments;
  const [chosenDeadline, setDeadline] = useState(initialDeadline);
  const deadline = byInstallments ? lastInstallment : chosenDeadline;
  const [frequency, setFrequency] = useState(initialFrequency);
  const [selectedFrequency, setSelectedFrequency] = useState(initialFrequency);
  const [comfortAmount, setComfortAmount] = useState(null);

  const plans = useMemo(
    () =>
      byInstallments
        ? compareInstallmentPlans({ installments, reserved, today: currentDay })
        : comparePlans({ outstanding, reserved, today: currentDay, deadline }),
    [byInstallments, installments, outstanding, reserved, currentDay, deadline],
  );

  const planByFrequency = useMemo(
    () => plans.reduce((result, plan) => ({ ...result, [plan.frequency]: plan }), {}),
    [plans],
  );
  const selectedPlan = planByFrequency[selectedFrequency] || planByFrequency.monthly;

  const assessment = useMemo(
    () => (selectedPlan ? assessPlan(selectedPlan, context || {}, currentDay) : null),
    [selectedPlan, context, currentDay],
  );

  const comfortPlan = useMemo(() => {
    if (!Number.isSafeInteger(comfortAmount) || comfortAmount <= 0) return null;
    return planFromAmount({
      outstanding,
      reserved,
      today: currentDay,
      deadline,
      frequency,
      amountPerPeriod: comfortAmount,
      installments: byInstallments ? installments : null,
    });
  }, [comfortAmount, outstanding, reserved, currentDay, deadline, frequency, byInstallments, installments]);

  const hasDebt = outstanding > 0;
  const reserveAmount = selectedPlan ? selectedPlan.perPeriod : 0;

  const selectFrequency = value => {
    setFrequency(value);
    setSelectedFrequency(value);
    // Se guarda: "Gasto de hoy" aparta con este periodo.
    if (onFrequencyChange) onFrequencyChange(value);
  };

  return (
    <View>
      <AppText variant="title">{debt.name}</AppText>
      {!hasDebt ? <AppText variant="subtitle" color={colors.teal} style={styles.status}>Deuda liquidada</AppText> : null}

      <View style={styles.metrics}>
        <Amount label="Pendiente" value={outstanding} variant="amountLg" />
        <Amount label="Apartado" value={reserved} color={colors.gold} />
        <Amount label="Pagado" value={paidTotal} color={colors.teal} />
        <Amount label="Recomendado por periodo" value={selectedPlan ? selectedPlan.perPeriod : 0} color={colors.violet} />
      </View>
      <AppText variant="caption" color={colors.textSecondary} style={styles.explanation}>
        La recomendación es una guía: no crea pagos ni modifica lo apartado o lo pendiente.
      </AppText>

      {installments ? <Segmented options={GOAL_OPTIONS} value={goal} onChange={setGoal} style={styles.segmented} /> : null}
      {byInstallments ? (
        <AppText variant="caption" color={colors.textSecondary} style={styles.explanation}>
          Reparte cada mensualidad para tenerla lista en su fecha de pago. Última: {formatDate(lastInstallment)}.
        </AppText>
      ) : (
        <DateTimeField label="Fecha límite" value={deadline} onChange={setDeadline} mode="date" />
      )}
      <Segmented options={FREQUENCY_OPTIONS} value={frequency} onChange={selectFrequency} style={styles.segmented} />

      <AppText variant="subtitle" style={styles.heading}>Elige un plan</AppText>
      <View style={styles.planList}>
        {['weekly', 'biweekly', 'monthly'].map(value => {
          const plan = planByFrequency[value];
          const selected = selectedFrequency === value;
          return (
            <Card
              key={value}
              onPress={() => selectFrequency(value)}
              index={FREQUENCY_OPTIONS.findIndex(option => option.value === value)}
              style={[styles.planCard, selected && styles.selectedPlan]}
              accessibilityLabel={`${plan.label}: ${formatMoney(plan.perPeriod)} ${plan.perLabel}, ${plan.periods} periodos${selected ? ', seleccionado' : ''}`}>
              <View style={styles.planHeader}>
                <AppText variant="subtitle">{plan.label}</AppText>
                {selected ? <AppText variant="caption" color={colors.teal}>Seleccionado</AppText> : null}
              </View>
              <AppText variant="amountLg" color={selected ? colors.teal : colors.text}>{formatMoney(plan.perPeriod)}</AppText>
              <AppText variant="caption" color={colors.textSecondary}>
                {plan.perLabel} · {plan.periods} {plan.periods === 1 ? 'periodo' : 'periodos'}
              </AppText>
              {plan.firstDue ? (
                <AppText variant="caption" color={plan.firstDue.short ? colors.gold : colors.textSecondary}>
                  Para el pago del {formatDate(plan.firstDue.date)}
                  {plan.firstDue.short ? ` (${plan.firstDue.count} ${plan.firstDue.count === 1 ? 'aportación' : 'aportaciones'}: queda menos tiempo)` : ''}
                  {plan.later && plan.later.length ? ` · ${plan.later.map((l, i) => `${i ? 'después' : 'luego'} ${formatMoney(l.amount)}`).join(', ')}` : ''}
                </AppText>
              ) : null}
            </Card>
          );
        })}
      </View>

      {selectedPlan ? (
        <Card style={styles.scheduleCard} animate={false}>
          <View style={styles.planHeader}>
            <AppText variant="subtitle">Calendario</AppText>
            <AppText variant="caption" color={colors.textSecondary}>{selectedPlan.periods} periodos</AppText>
          </View>
          <Schedule schedule={selectedPlan.schedule} />
          <View style={styles.totalRow}>
            <AppText variant="small" color={colors.textSecondary}>{reserved > 0 ? 'Total a cubrir (pendiente − apartado)' : 'Total a cubrir'}</AppText>
            <AppText variant="amount" accessibilityLabel={`Total a cubrir: ${formatMoney(selectedPlan.toCover)}`}>
              {formatMoney(selectedPlan.toCover)}
            </AppText>
          </View>
        </Card>
      ) : null}

      <Card style={styles.comfortCard} animate={false}>
        <AppText variant="subtitle">Ajustar a mi comodidad</AppText>
        <AppText variant="caption" color={colors.textSecondary} style={styles.helper}>
          Define cuánto puedes apartar en cada periodo.
        </AppText>
        <AmountField label={`Cantidad ${selectedPlan ? selectedPlan.perLabel : 'por periodo'}`} value={comfortAmount} onChange={setComfortAmount} />
        {comfortPlan ? (
          <View>
            <View style={styles.totalRow}>
              <AppText variant="small" color={colors.textSecondary}>Terminas el</AppText>
              <AppText variant="small">{formatDate(comfortPlan.finishDate, { withWeekday: true })}</AppText>
            </View>
            {comfortPlan.missedInstallment ? (
              <AppText variant="small" color={colors.coral} style={styles.notice}>
                No alcanza para la mensualidad del {formatDate(comfortPlan.missedInstallment.date)}.
              </AppText>
            ) : !comfortPlan.meetsDeadline ? (
              <AppText variant="small" color={colors.coral} style={styles.notice}>
                Esta cantidad no alcanza la fecha límite del {formatDate(deadline)}.
              </AppText>
            ) : (
              <AppText variant="small" color={colors.teal} style={styles.notice}>Cumple la fecha límite.</AppText>
            )}
          </View>
        ) : null}
      </Card>

      {assessment ? (
        <View style={styles.assessment}>
          {assessment.warnings.map(warning => <AppText key={warning} variant="small" color={colors.coral} style={styles.notice}>{warning}</AppText>)}
          {assessment.missing.length ? (
            <AppText variant="small" color={colors.textSecondary} style={styles.notice}>
              Faltan datos: {assessment.missing.join('; ')}
            </AppText>
          ) : null}
          {assessment.notes.map(note => <AppText key={note} variant="caption" color={colors.textSecondary} style={styles.notice}>{note}</AppText>)}
          {assessment.basis === 'arithmetic' ? <AppText variant="caption" color={colors.textMuted} style={styles.notice}>Recomendación aritmética</AppText> : null}
        </View>
      ) : null}

      <View style={styles.actions}>
        <Button
          title="Apartar"
          onPress={() => onReserve(reserveAmount)}
          disabled={!hasDebt || reserveAmount <= 0}
          accessibilityLabel={`Apartar ${formatMoney(reserveAmount)}`}
        />
        <Button
          title="Registrar pago"
          variant="secondary"
          onPress={onRegisterPayment}
          disabled={!hasDebt}
          accessibilityLabel="Registrar pago de la deuda"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  status: { marginTop: spacing.xs },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.xl, marginHorizontal: -spacing.xs },
  metric: { width: '50%', paddingHorizontal: spacing.xs, marginBottom: spacing.lg },
  explanation: { marginBottom: spacing.xl },
  segmented: { marginBottom: spacing.xl },
  heading: { marginBottom: spacing.md },
  planList: { gap: spacing.sm },
  planCard: { padding: spacing.md },
  selectedPlan: { borderColor: colors.teal, borderWidth: 1.5, backgroundColor: colors.tealSoft },
  planHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  scheduleCard: { marginTop: spacing.lg },
  schedule: { marginTop: spacing.sm },
  scheduleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md },
  comfortCard: { marginTop: spacing.lg },
  helper: { marginTop: spacing.xs, marginBottom: spacing.lg },
  notice: { marginTop: spacing.sm },
  more: { marginTop: spacing.sm },
  assessment: { marginTop: spacing.lg },
  actions: { gap: spacing.sm, marginTop: spacing.xl, marginBottom: spacing.xxl },
});
