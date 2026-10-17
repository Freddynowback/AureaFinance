import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, spacing } from '../config/theme';
import { useDb } from '../hooks/DatabaseProvider';
import { useQuery } from '../hooks/useQuery';
import { useSettings } from '../hooks/useSettings';
import { useToast } from '../components/common/Toast';
import { transactionsRepository } from '../database/repositories/transactionsRepository';
import { confirmOccurrence, listRules, skipOccurrence, upcoming } from '../services/recurring/recurringService';
import { FREQUENCY_LABELS, getPeriod } from '../utils/periods';
import { addDays, formatDate, todayISO } from '../utils/dates';
import { formatMoney } from '../utils/money';
import { ROUTES } from '../navigation/routes';
import AppText from '../components/common/AppText';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import Screen from '../components/common/Screen';
import TransactionCard from '../components/TransactionCard';

async function load(db, period) {
  const today = todayISO();
  const [totals, periodIncome, expected, expenses, rules, recent] = await Promise.all([
    transactionsRepository.totals(db, period.start, period.end),
    upcoming(db, { from: period.start, to: addDays(period.end, -1), kind: 'income' }),
    upcoming(db, { from: addDays(today, -7), to: addDays(today, 45), kind: 'income' }),
    upcoming(db, { from: addDays(today, -7), to: addDays(today, 45), kind: 'expense' }),
    listRules(db),
    transactionsRepository.search(db, { kinds: ['income'] }, { limit: 10 }),
  ]);
  return {
    totals,
    periodExpected: periodIncome.reduce((sum, item) => sum + item.amount, 0),
    expected,
    expenses,
    rules,
    recent,
  };
}

export default function INGRESOS({ navigation }) {
  const db = useDb();
  const toast = useToast();
  const { periodSettings } = useSettings();
  const { data, loading, reload } = useQuery(d => (periodSettings ? load(d, getPeriod(todayISO(), periodSettings)) : Promise.resolve(null)), [periodSettings]);

  const act = async (occurrence, action) => {
    try {
      if (action === 'confirm') {
        await confirmOccurrence(db, occurrence.id);
        toast(occurrence.kind === 'income' ? 'Ingreso recibido registrado' : 'Gasto registrado');
      } else {
        await skipOccurrence(db, occurrence.id);
        toast('Ocurrencia omitida');
      }
      reload();
    } catch (error) {
      toast(error.message || 'No se pudo actualizar la ocurrencia', 'error');
    }
  };

  if (loading || !data) return <Screen />;
  const period = periodSettings && getPeriod(todayISO(), periodSettings);
  return (
    <Screen refreshing={loading} onRefresh={reload}>
      <View style={styles.header}>
        <View style={styles.flex}><AppText variant="title">Ingresos</AppText><AppText variant="caption" color={colors.textSecondary}>Administra lo recibido y lo que esperas recibir.</AppText></View>
        <Button title="Registrar ingreso" small onPress={() => navigation.navigate(ROUTES.MOVIMIENTO_FORM, { kind: 'income' })} />
      </View>
      <Card style={styles.periodCard}>
        <AppText variant="subtitle">Este periodo</AppText>
        <AppText variant="caption" color={colors.textSecondary} style={styles.periodLabel}>{period.start} – {addDays(period.end, -1)}</AppText>
        <View style={styles.metrics}>
          <Metric label="Recibido" value={data.totals.income} color={colors.positive} />
          <Metric label="Previsto (estimación, no está en tus cuentas)" value={data.periodExpected} color={colors.gold} />
        </View>
      </Card>
      <Section title="Ingresos esperados">
        <UpcomingList rows={data.expected} today={todayISO()} onAction={act} kind="income" />
      </Section>
      <Section title="Pagos recurrentes próximos">
        <UpcomingList rows={data.expenses} today={todayISO()} onAction={act} kind="expense" />
      </Section>
      <Section title="Reglas recurrentes">
        {data.rules.length ? (
          <>
            <RulesGroup title="Ingresos" rules={data.rules.filter(rule => rule.kind === 'income')} navigation={navigation} />
            <RulesGroup title="Gastos" rules={data.rules.filter(rule => rule.kind === 'expense')} navigation={navigation} />
          </>
        ) : <AppText color={colors.textSecondary}>Aún no tienes reglas recurrentes.</AppText>}
      </Section>
      <Section title="Ingresos recientes">
        {data.recent.length ? data.recent.map(tx => <TransactionCard key={tx.id} tx={tx} onPress={() => navigation.navigate(ROUTES.MOVIMIENTO_DETALLE, { id: tx.id })} />) : <AppText color={colors.textSecondary}>Todavía no hay ingresos registrados.</AppText>}
      </Section>
      <Button title="Nueva recurrencia" icon="plus" variant="secondary" onPress={() => navigation.navigate(ROUTES.RECURRENTE_FORM, { kind: 'income' })} style={styles.bottomButton} />
    </Screen>
  );
}

function Metric({ label, value, color }) {
  return <View style={styles.metric}><AppText variant="caption" color={colors.textSecondary}>{label}</AppText><AppText variant="amountLg" color={color}>{formatMoney(value)}</AppText></View>;
}

function Section({ title, children }) {
  return <View style={styles.section}><AppText variant="subtitle" style={styles.sectionTitle}>{title}</AppText>{children}</View>;
}

function RulesGroup({ title, rules, navigation }) {
  if (!rules.length) return null;
  return <View style={styles.group}><AppText variant="caption" color={colors.textSecondary} style={styles.groupTitle}>{title}</AppText>{rules.map((rule, index) => (
    <Card key={rule.id} index={index} style={styles.rule} onPress={() => navigation.navigate(ROUTES.RECURRENTE_FORM, { id: rule.id })}>
      <View style={styles.ruleTop}><AppText variant="subtitle">{rule.name}</AppText><AppText color={rule.kind === 'income' ? colors.positive : colors.text}>{formatMoney(rule.amount)}</AppText></View>
      <AppText variant="caption" color={colors.textSecondary}>{FREQUENCY_LABELS[rule.frequency] || rule.frequency} · {rule.account_name || 'Sin cuenta'}</AppText>
      <AppText variant="caption" color={rule.status === 'paused' ? colors.coral : colors.textMuted}>{rule.status === 'paused' ? 'Pausada' : 'Activa'}{rule.auto_post ? ' · Registro automático' : ''}</AppText>
    </Card>
  ))}</View>;
}

function UpcomingList({ rows, today, onAction, kind }) {
  if (!rows.length) return <AppText color={colors.textSecondary}>No hay {kind === 'income' ? 'ingresos' : 'pagos'} próximos.</AppText>;
  return rows.map(row => {
    const overdue = row.due_date < today;
    return (
      <Card key={row.id} style={styles.occurrence} animate={false}>
        <View style={styles.ruleTop}><View style={styles.flex}><AppText variant="subtitle">{row.name}</AppText><AppText variant="caption" color={overdue ? colors.coral : colors.textSecondary}>{overdue ? 'Vencido · ' : ''}{formatDate(row.due_date)} · {row.account_name || 'Sin cuenta'}</AppText></View><AppText variant="amount" color={kind === 'income' ? colors.positive : colors.text}> {formatMoney(row.amount)}</AppText></View>
        <View style={styles.actions}><Button title={kind === 'income' ? 'Confirmar recibido' : 'Registrar gasto'} small onPress={() => onAction(row, 'confirm')} style={styles.actionButton} /><Button title="Omitir" small variant="secondary" onPress={() => onAction(row, 'skip')} style={styles.actionButton} /></View>
      </Card>
    );
  });
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  flex: { flex: 1 },
  periodCard: { marginBottom: spacing.xl },
  periodLabel: { marginTop: spacing.xs },
  metrics: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.lg },
  metric: { flex: 1, gap: spacing.xs },
  section: { marginBottom: spacing.xl },
  sectionTitle: { marginBottom: spacing.md },
  group: { marginBottom: spacing.md },
  groupTitle: { marginBottom: spacing.sm, textTransform: 'uppercase' },
  occurrence: { padding: spacing.md, marginBottom: spacing.sm },
  rule: { padding: spacing.md, marginBottom: spacing.sm },
  ruleTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  actionButton: { flex: 1 },
  bottomButton: { marginBottom: spacing.lg },
});
