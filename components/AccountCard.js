import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, spacing } from '../config/theme';
import { formatDate } from '../utils/dates';
import { formatMoney } from '../utils/money';
import { ACCOUNT_TYPE_LABELS } from '../services/transactions/rules';
import AppText from './common/AppText';
import Card from './common/Card';
import Icon from './common/Icon';
import CreditUsage from './CreditUsage';
import { creditSummary } from '../services/accounts/creditService';

const TYPE_ICON = { cash: 'cash', debit: 'wallet', savings: 'piggy', credit: 'card', other: 'bank' };
const TYPE_COLOR = { cash: colors.gold, debit: colors.teal, savings: colors.violet, credit: colors.coral, other: colors.info };

/** Tarjeta de cuenta. En crédito muestra deuda, crédito disponible y fechas. */
export default function AccountCard({ account, onPress, index }) {
  const color = account.color || TYPE_COLOR[account.type];
  const isCredit = account.type === 'credit';
  return (
    <Card index={index} onPress={onPress} style={styles.card} accessibilityLabel={`${account.name}, ${ACCOUNT_TYPE_LABELS[account.type]}`}>
      <View style={styles.row}>
        <View style={[styles.icon, { backgroundColor: color + '22' }]}><Icon name={TYPE_ICON[account.type]} size={20} color={color} /></View>
        <View style={styles.flex}>
          <AppText variant="subtitle" numberOfLines={1}>{account.name}</AppText>
          <AppText variant="caption" color={colors.textSecondary} numberOfLines={1}>
            {ACCOUNT_TYPE_LABELS[account.type]}{account.institution ? ` · ${account.institution}` : ''}{account.status === 'archived' ? ' · archivada' : ''}
          </AppText>
        </View>
        <View style={styles.right}>
          {isCredit ? (
            <>
              <AppText variant="caption" color={colors.textSecondary}>Deuda</AppText>
              <AppText variant="subtitle" color={account.debt > 0 ? colors.coral : colors.text}>{formatMoney(account.debt, account.currency)}</AppText>
            </>
          ) : (
            <AppText variant="subtitle" color={account.balance < 0 ? colors.coral : colors.text}>{formatMoney(account.balance, account.currency)}</AppText>
          )}
        </View>
      </View>
      {isCredit ? (
        <View style={styles.credit}>
          <CreditUsage summary={account.credit || creditSummary(account)} currency={account.currency} compact />
          {account.nextDue || account.nextStatement ? (
            <AppText variant="caption" color={colors.textSecondary} style={styles.mt}>
              {account.nextStatement ? `Corte ${formatDate(account.nextStatement, { withYear: false })}` : ''}
              {account.nextStatement && account.nextDue ? ' · ' : ''}
              {account.nextDue ? `Pago ${formatDate(account.nextDue, { withYear: false })}` : ''}
            </AppText>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center' },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, marginHorizontal: spacing.md },
  right: { alignItems: 'flex-end' },
  credit: { marginTop: spacing.md },
  mt: { marginTop: 6 },
});
