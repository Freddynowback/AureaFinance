/**
 * DEUDAS — financiaciones y deuda de tarjetas, con próximos vencimientos.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, spacing } from '../config/theme';
import { ROUTES } from '../navigation/routes';
import { useQuery } from '../hooks/useQuery';
import { listDebts, FINANCING_LABELS } from '../services/debts/debtService';
import { getAccountsOverview } from '../services/accounts/accountService';
import { formatDate, relativeDays, todayISO } from '../utils/dates';
import { formatMoney } from '../utils/money';
import AppText from '../components/common/AppText';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import EmptyState from '../components/common/EmptyState';
import ProgressBar from '../components/common/ProgressBar';
import Screen from '../components/common/Screen';
import SectionHeader from '../components/common/SectionHeader';
import AccountCard from '../components/AccountCard';

async function load(db) {
  const [debts, overview] = await Promise.all([listDebts(db, { includeClosed: true }), getAccountsOverview(db)]);
  return { debts, cards: overview.accounts.filter(a => a.type === 'credit'), totalCardDebt: overview.creditDebt, credit: overview.credit };
}

export default function DEUDAS({ navigation }) {
  const { data, loading, reload } = useQuery(load, []);
  const today = todayISO();
  if (!data) return <Screen />;
  const active = data.debts.filter(d => d.status === 'active');
  const closed = data.debts.filter(d => d.status !== 'active');
  const totalFinancing = active.reduce((s, d) => s + Math.max(0, d.outstanding), 0);
  const totalReserved = active.reduce((s, d) => s + Math.max(0, d.reserved), 0);

  return (
    <Screen onRefresh={reload} refreshing={loading}>
      <Card index={0}>
        <AppText variant="label" color={colors.textSecondary}>Deuda total en tarjetas</AppText>
        <AppText variant="amountLg" color={data.totalCardDebt ? colors.coral : colors.text} style={styles.mt}>{formatMoney(data.totalCardDebt)}</AppText>
        <View style={styles.row}>
          <View style={styles.flex}>
            <AppText variant="caption" color={colors.textSecondary}>Financiaciones pendientes</AppText>
            <AppText variant="subtitle">{formatMoney(totalFinancing)}</AppText>
          </View>
          <View style={styles.flex}>
            <AppText variant="caption" color={colors.textSecondary}>Apartado para pagos</AppText>
            <AppText variant="subtitle" color={colors.gold}>{formatMoney(totalReserved)}</AppText>
          </View>
        </View>
        {data.credit && data.credit.limit ? (
          <View style={styles.row}>
            <View style={styles.flex}>
              <AppText variant="caption" color={colors.textSecondary}>Crédito autorizado</AppText>
              <AppText variant="subtitle">{formatMoney(data.credit.limit)}</AppText>
            </View>
            <View style={styles.flex}>
              <AppText variant="caption" color={colors.textSecondary}>Crédito disponible</AppText>
              <AppText variant="subtitle" color={data.credit.available < 0 ? colors.coral : colors.teal}>{formatMoney(data.credit.available)}</AppText>
            </View>
          </View>
        ) : null}
        {data.credit && data.credit.cardsWithoutLimit ? <AppText variant="caption" color={colors.textMuted} style={styles.mt}>{data.credit.cardsWithoutLimit} tarjeta(s) sin límite configurado no cuentan en el disponible.</AppText> : null}
        <AppText variant="caption" color={colors.textMuted} style={styles.mt}>Las financiaciones forman parte de la deuda de su tarjeta; no se suman dos veces. Los pagos mensuales son los que tú registras.</AppText>
      </Card>

      <View style={styles.actions}>
        <Button title="Nueva deuda" icon="plus" onPress={() => navigation.navigate(ROUTES.DEUDA_FORM)} style={styles.flex} disabled={!data.cards.length} />
        <Button title="Pagar tarjeta" icon="card" variant="secondary" onPress={() => navigation.navigate(ROUTES.MOVIMIENTO_FORM, { kind: 'card_payment' })} style={styles.flex} disabled={!data.cards.length} />
      </View>

      {!data.cards.length ? (
        <EmptyState
          icon="card"
          title="Añade una tarjeta o cuenta de crédito"
          message="Cada deuda o financiación pertenece a una tarjeta o crédito. Crea primero la cuenta con su fecha de corte y de pago."
          actionLabel="Crear cuenta de crédito"
          onAction={() => navigation.navigate(ROUTES.CUENTA_FORM, { type: 'credit' })}
        />
      ) : null}

      {active.length ? <SectionHeader title="Financiaciones y deudas" /> : null}
      {active.map((d, i) => {
        const outstanding = Math.max(0, d.outstanding);
        const reservedPct = outstanding ? Math.min(1, Math.max(0, d.reserved) / outstanding) : 0;
        return (
          <Card key={d.id} index={i + 1} style={styles.item} onPress={() => navigation.navigate(ROUTES.DEUDA_DETALLE, { id: d.id })}>
            <View style={styles.row}>
              <View style={styles.flex}>
                <AppText variant="subtitle" numberOfLines={1}>{d.name}</AppText>
                <AppText variant="caption" color={colors.textSecondary}>{FINANCING_LABELS[d.financing_type]} · {d.account_name || 'sin tarjeta'}</AppText>
              </View>
              <View style={styles.right}>
                <AppText variant="subtitle" color={outstanding ? colors.coral : colors.teal}>{outstanding ? formatMoney(outstanding) : 'Liquidada'}</AppText>
                {d.monthly_payment ? <AppText variant="caption" color={colors.textSecondary}>{formatMoney(d.monthly_payment)} / mes</AppText> : null}
              </View>
            </View>
            {outstanding ? (
              <View style={styles.mtMd}>
                <ProgressBar value={reservedPct} color={colors.gold} height={5} />
                <View style={[styles.row, styles.mt]}>
                  <AppText variant="caption" color={colors.textSecondary}>Apartado {formatMoney(Math.max(0, d.reserved))}</AppText>
                  {d.effectiveDueDate ? (
                    <AppText variant="caption" color={d.effectiveDueDate <= today ? colors.coral : colors.gold}>
                      Vence {formatDate(d.effectiveDueDate, { withYear: false })} ({relativeDays(d.effectiveDueDate, today)})
                    </AppText>
                  ) : null}
                </View>
              </View>
            ) : null}
            {d.balance_updated_at ? <AppText variant="caption" color={colors.textMuted} style={styles.mt}>Saldo actualizado el {formatDate(d.balance_updated_at)}</AppText> : null}
          </Card>
        );
      })}

      {data.cards.length ? <SectionHeader title="Tarjetas y créditos" /> : null}
      {data.cards.map((a, i) => (
        <AccountCard key={a.id} account={a} index={i + active.length + 1} onPress={() => navigation.navigate(ROUTES.CUENTA_DETALLE, { id: a.id })} />
      ))}

      {closed.length ? <SectionHeader title="Liquidadas o archivadas" /> : null}
      {closed.map(d => (
        <Card key={d.id} style={styles.item} onPress={() => navigation.navigate(ROUTES.DEUDA_DETALLE, { id: d.id })} animate={false}>
          <AppText color={colors.textSecondary}>{d.name} · {d.status === 'paid' ? 'Liquidada' : 'Archivada'}</AppText>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  mt: { marginTop: 6 },
  mtMd: { marginTop: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  flex: { flex: 1 },
  right: { alignItems: 'flex-end', marginLeft: spacing.md },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  item: { marginBottom: spacing.md },
});
