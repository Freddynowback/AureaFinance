import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, radii, spacing } from '../config/theme';
import AppText from './common/AppText';
import { formatMoney } from '../utils/money';

function amount(value, currency) {
  return formatMoney(Number.isFinite(value) ? value : 0, currency);
}

function Stat({ label, value, color = colors.text }) {
  return (
    <View style={styles.stat}>
      <AppText variant="caption" color={colors.textSecondary} numberOfLines={1}>{label}</AppText>
      <AppText variant="amount" color={color} numberOfLines={1}>{value}</AppText>
    </View>
  );
}

function UsageBar({ summary }) {
  const limit = Math.max(0, summary.limit);
  const financed = Math.max(0, Math.min(summary.financed || 0, limit));
  const revolving = Math.max(0, Math.min(summary.revolving || 0, limit - financed));
  const total = summary.overLimit ? 100 : limit ? Math.min(100, (summary.used / limit) * 100) : 0;

  return (
    <View
      style={styles.bar}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(total) }}
    >
      {summary.overLimit ? (
        <View style={[styles.segment, styles.overSegment, { width: '100%' }]} />
      ) : (
        <>
          <View style={[styles.segment, styles.financedSegment, { width: `${(financed / limit) * 100}%` }]} />
          <View style={[styles.segment, styles.revolvingSegment, { width: `${(revolving / limit) * 100}%` }]} />
        </>
      )}
    </View>
  );
}

export default function CreditUsage({ summary, currency = 'MXN', compact = false }) {
  const data = summary || {};
  const hasLimit = data.limit !== null && data.limit !== undefined;
  const used = amount(data.used, currency);
  const available = amount(Math.max(0, data.available || 0), currency);
  const availableLabel = data.available < 0
    ? `Excedido ${amount(Math.abs(data.available), currency)}`
    : available;
  const accessibilityLabel = hasLimit
    ? `Límite autorizado ${amount(data.limit, currency)}, en uso ${used}, disponible ${availableLabel}`
    : `Sin límite configurado. En uso ${used}`;

  return (
    <View style={styles.container} accessible accessibilityLabel={accessibilityLabel}>
      {!hasLimit ? (
        <>
          <AppText variant="subtitle" numberOfLines={1}>Sin límite configurado</AppText>
          <AppText variant="caption" color={colors.textSecondary} numberOfLines={1}>En uso {used}</AppText>
          <AppText variant="caption" color={colors.textMuted} style={styles.hint} numberOfLines={2}>
            Configura el límite autorizado para ver tu crédito disponible.
          </AppText>
        </>
      ) : compact ? (
        <>
          <UsageBar summary={data} />
          <AppText variant="caption" color={colors.textSecondary} style={styles.compactText} numberOfLines={1}>
            Disponible {availableLabel} de {amount(data.limit, currency)} · En uso {used}
          </AppText>
        </>
      ) : (
        <>
          <View style={styles.stats}>
            <Stat label="Límite autorizado" value={amount(data.limit, currency)} />
            <Stat label="En uso" value={used} />
            <Stat label="Disponible" value={availableLabel} color={data.available < 0 ? colors.coral : colors.text} />
          </View>
          <UsageBar summary={data} />
          {data.plansCount > 0 ? (
            <View style={styles.breakdown}>
              <AppText variant="caption" color={colors.textSecondary} numberOfLines={2}>
                Financiado ({data.plansCount} {data.plansCount === 1 ? 'plan' : 'planes'}) · pago mensual que registraste {amount(data.monthlyDue, currency)}
                {data.plansWithoutMonthly > 0 ? ' · algún plan sin pago mensual registrado' : ''}
              </AppText>
              <AppText variant="caption" color={colors.textSecondary} numberOfLines={1}>
                Sin financiar {amount(data.revolving, currency)}
              </AppText>
            </View>
          ) : null}
          {data.inFavor > 0 ? (
            <AppText variant="caption" color={colors.teal} style={styles.message} numberOfLines={2}>
              Saldo a favor {amount(data.inFavor, currency)}
            </AppText>
          ) : null}
          {data.unreconciled > 0 ? (
            <AppText variant="caption" color={colors.gold} style={styles.message} numberOfLines={3}>
              Tus financiaciones suman más que la deuda registrada de la tarjeta. Concilia la tarjeta o marca el plan como no incluido.
            </AppText>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  stats: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  stat: { flex: 1 },
  bar: {
    flexDirection: 'row',
    height: 8,
    overflow: 'hidden',
    backgroundColor: colors.ringTrack,
    borderRadius: radii.pill,
  },
  segment: { height: '100%' },
  financedSegment: { backgroundColor: colors.violet },
  revolvingSegment: { backgroundColor: colors.gold },
  overSegment: { backgroundColor: colors.coral },
  breakdown: { gap: 4 },
  hint: { marginTop: spacing.xs },
  message: { marginTop: spacing.xs },
  compactText: { marginTop: 2 },
});
