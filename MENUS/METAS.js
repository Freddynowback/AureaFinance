import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, spacing } from '../config/theme';
import { ROUTES } from '../navigation/routes';
import { useQuery } from '../hooks/useQuery';
import { listGoals } from '../services/goals/goalService';
import { formatDate, todayISO, diffDays } from '../utils/dates';
import { formatMoney } from '../utils/money';
import AppText from '../components/common/AppText';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import EmptyState from '../components/common/EmptyState';
import ProgressBar from '../components/common/ProgressBar';
import Screen from '../components/common/Screen';

export default function METAS({ navigation }) {
  const { data: goals, loading } = useQuery(listGoals, []);

  return (
    <Screen refreshing={loading && !!goals}>
      <View style={styles.header}>
        <View style={styles.flex}>
          <AppText variant="title">Metas de ahorro</AppText>
          <AppText variant="caption" color={colors.textSecondary}>Aparta dinero con un propósito</AppText>
        </View>
        <Button title="Nueva meta" icon="plus" small onPress={() => navigation.navigate(ROUTES.META_FORM)} />
      </View>
      {goals && goals.length ? goals.map((goal, index) => (
        <GoalCard key={goal.id} goal={goal} index={index} onPress={() => navigation.navigate(ROUTES.META_DETALLE, { id: goal.id })} />
      )) : goals ? (
        <EmptyState
          icon="target"
          title="Aún no tienes metas"
          message="Crea una meta para apartar dinero para un viaje, un fondo o cualquier proyecto."
          actionLabel="Crear una meta"
          onAction={() => navigation.navigate(ROUTES.META_FORM)}
        />
      ) : null}
    </Screen>
  );
}

function GoalCard({ goal, index, onPress }) {
  const saved = goal.saved || 0;
  const remaining = Math.max(0, goal.target_amount - saved);
  const percent = goal.target_amount ? Math.min(1, saved / goal.target_amount) : 0;
  const days = goal.deadline ? diffDays(todayISO(), goal.deadline) : null;
  const months = days === null ? null : Math.max(1, Math.ceil(days / 30));
  const monthly = remaining > 0 && months ? Math.ceil(remaining / months) : 0;
  const deadlineText = days === null
    ? 'Sin fecha límite'
    : days < 0 ? `Venció el ${formatDate(goal.deadline)}` : `${formatDate(goal.deadline)} · ${days === 0 ? 'vence hoy' : `quedan ${days} días`}`;

  return (
    <Card index={index} onPress={onPress} style={styles.card} accessibilityLabel={`Meta ${goal.name}`}>
      <View style={styles.row}>
        <View style={[styles.dot, { backgroundColor: goal.color || colors.teal }]} />
        <View style={styles.flex}>
          <AppText variant="subtitle" numberOfLines={1}>{goal.name}</AppText>
          <AppText variant="caption" color={colors.textSecondary}>
            {goal.mode === 'virtual' ? 'Reserva virtual' : `En cuenta de ahorro: ${goal.account_name || 'sin cuenta'}`}
          </AppText>
        </View>
        <AppText variant="subtitle" color={percent >= 1 ? colors.positive : colors.text}>{Math.round(percent * 100)}%</AppText>
      </View>
      <ProgressBar value={percent} color={goal.color || colors.teal} />
      <View style={styles.between}>
        <AppText variant="caption" color={colors.textSecondary}>{formatMoney(saved)} de {formatMoney(goal.target_amount)}</AppText>
        <AppText variant="caption" color={remaining ? colors.textSecondary : colors.positive}>
          {remaining ? `Restan ${formatMoney(remaining)}` : 'Meta completada'}
        </AppText>
      </View>
      <AppText variant="caption" color={days !== null && days < 0 ? colors.coral : colors.textMuted}>{deadlineText}</AppText>
      {monthly > 0 && days >= 0 ? (
        <AppText variant="caption" color={colors.gold}>Estimación: aparta {formatMoney(monthly)} al mes</AppText>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
  card: { marginBottom: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  dot: { width: 12, height: 12, borderRadius: 6, marginRight: spacing.md },
  flex: { flex: 1 },
  between: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm, marginBottom: spacing.xs },
});
