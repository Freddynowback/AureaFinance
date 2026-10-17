import React, { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, spacing } from '../config/theme';
import { formatDateTime } from '../utils/dates';
import { formatMoney } from '../utils/money';
import { KIND_LABELS, PAYMENT_METHOD_LABELS } from '../services/transactions/rules';
import AppText from './common/AppText';
import CategoryIcon from './CategoryIcon';

const KIND_ICON = { transfer: 'transfer', card_payment: 'card', adjustment: 'sliders', income: 'salary', refund: 'refund' };

function titleOf(t) {
  if (t.description) return t.description;
  if (t.kind === 'transfer') return `${t.account_name} → ${t.to_account_name}`;
  if (t.kind === 'card_payment') return `Pago a ${t.to_account_name}`;
  if (t.kind === 'income') return t.source || t.category_name || 'Ingreso';
  return t.category_name || KIND_LABELS[t.kind];
}

function signed(t, accountId) {
  switch (t.kind) {
    case 'expense':
      return { text: '-' + formatMoney(t.amount, t.currency), color: colors.text };
    case 'income':
    case 'refund':
      return { text: '+' + formatMoney(t.amount, t.currency), color: colors.positive };
    case 'adjustment':
      return { text: formatMoney(t.amount, t.currency, { sign: true }), color: colors.textSecondary };
    default:
      if (accountId && t.to_account_id === accountId) return { text: '+' + formatMoney(t.amount, t.currency), color: colors.positive };
      if (accountId && t.account_id === accountId) return { text: '-' + formatMoney(t.amount, t.currency), color: colors.text };
      return { text: formatMoney(t.amount, t.currency), color: colors.textSecondary };
  }
}

/** Fila de movimiento: categoría, descripción, fecha, cuenta, método e importe con signo. */
function TransactionCard({ tx, onPress, accountId, compact }) {
  const amount = signed(tx, accountId);
  const meta = [
    formatDateTime(tx.occurred_at),
    tx.kind === 'transfer' || tx.kind === 'card_payment' ? null : tx.account_name,
    tx.payment_method && tx.kind === 'expense' ? PAYMENT_METHOD_LABELS[tx.payment_method] : null,
  ].filter((v, i, arr) => v && arr.indexOf(v) === i); // sin repetir "Efectivo · Efectivo"
  const showKind = tx.kind !== 'expense';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${KIND_LABELS[tx.kind]}: ${titleOf(tx)}, ${amount.text}, ${meta.join(', ')}`}
      style={({ pressed }) => [styles.row, compact && styles.compact, pressed && { opacity: 0.7 }]}>
      <CategoryIcon icon={tx.category_icon || KIND_ICON[tx.kind]} color={tx.category_color || colors.violet} size={compact ? 36 : 40} archived={tx.category_status === 'archived'} />
      <View style={styles.mid}>
        <AppText numberOfLines={1}>{titleOf(tx)}</AppText>
        <AppText variant="caption" color={colors.textSecondary} numberOfLines={1} style={styles.meta}>
          {showKind ? `${KIND_LABELS[tx.kind]} · ` : ''}
          {meta.join(' · ')}
        </AppText>
      </View>
      <AppText variant="subtitle" color={amount.color} style={styles.amount}>{amount.text}</AppText>
    </Pressable>
  );
}

export default memo(TransactionCard);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md },
  compact: { paddingVertical: spacing.sm },
  mid: { flex: 1, marginHorizontal: spacing.md },
  meta: { marginTop: 2 },
  amount: { fontVariant: ['tabular-nums'] },
});
