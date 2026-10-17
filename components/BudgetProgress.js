import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, spacing } from '../config/theme';
import { formatMoney } from '../utils/money';
import { describePeriod, PERIOD_LABELS } from '../utils/periods';
import AppText from './common/AppText';
import ProgressBar from './common/ProgressBar';
import CategoryIcon from './CategoryIcon';

/** Progreso de un presupuesto: consumido, restante, % y marcas de umbral. */
export default function BudgetProgress({ budget, title }) {
  const color = budget.exceeded ? colors.coral : budget.percent >= 80 ? colors.gold : colors.teal;
  return (
    <View>
      <View style={styles.top}>
        {budget.category_id ? <CategoryIcon icon={budget.category_icon} color={budget.category_color} size={32} /> : null}
        <View style={[styles.flex, budget.category_id && styles.ml]}>
          <AppText variant="subtitle" numberOfLines={1}>{title || budget.category_name || 'Presupuesto general'}</AppText>
          <AppText variant="caption" color={colors.textSecondary}>{PERIOD_LABELS[budget.period_type]} · {describePeriod(budget.period)}</AppText>
        </View>
        <AppText variant="subtitle" color={color}>{budget.percent}%</AppText>
      </View>
      <ProgressBar value={budget.spent / budget.amount} color={color} markers={budget.thresholds.filter(t => t < 100)} />
      <View style={styles.bottom}>
        <AppText variant="caption" color={colors.textSecondary}>{formatMoney(budget.spent)} de {formatMoney(budget.amount)}</AppText>
        <AppText variant="caption" color={budget.remaining < 0 ? colors.coral : colors.textSecondary}>
          {budget.remaining < 0 ? `Excedido ${formatMoney(-budget.remaining)}` : `Quedan ${formatMoney(budget.remaining)}`}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  flex: { flex: 1 },
  ml: { marginLeft: spacing.md },
  bottom: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
});
