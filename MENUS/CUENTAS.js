/**
 * CUENTAS — cuentas independientes con saldos derivados de sus movimientos.
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, spacing } from '../config/theme';
import { ROUTES } from '../navigation/routes';
import { useQuery } from '../hooks/useQuery';
import { getAccountsOverview } from '../services/accounts/accountService';
import { accountsRepository } from '../database/repositories/accountsRepository';
import { formatMoney } from '../utils/money';
import AppText from '../components/common/AppText';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import EmptyState from '../components/common/EmptyState';
import Screen from '../components/common/Screen';
import SectionHeader from '../components/common/SectionHeader';
import AccountCard from '../components/AccountCard';

export default function CUENTAS({ navigation }) {
  const [showArchived, setShowArchived] = useState(false);
  const { data } = useQuery(async db => ({
    overview: await getAccountsOverview(db),
    archived: (await accountsRepository.list(db, { includeArchived: true })).filter(a => a.status === 'archived'),
  }), []);
  if (!data) return <Screen />;
  const { overview } = data;
  const liquid = overview.accounts.filter(a => a.type !== 'credit');
  const credit = overview.accounts.filter(a => a.type === 'credit');
  return (
    <Screen>
      {overview.hasAccounts ? (
        <Card index={0}>
          <View style={styles.row}>
            <View style={styles.flex}>
              <AppText variant="label" color={colors.textSecondary}>Saldo líquido</AppText>
              <AppText variant="amountLg" style={styles.mt}>{formatMoney(overview.liquid)}</AppText>
            </View>
            <View style={styles.flex}>
              <AppText variant="label" color={colors.textSecondary}>Disponible</AppText>
              <AppText variant="amountLg" color={colors.teal} style={styles.mt}>{formatMoney(overview.available)}</AppText>
            </View>
          </View>
          <AppText variant="caption" color={colors.textMuted} style={styles.mt}>
            Disponible = saldo líquido − dinero apartado ({formatMoney(overview.reserved)}). La deuda de tarjetas ({formatMoney(overview.creditDebt)}) se muestra aparte.
          </AppText>
          {Object.entries(overview.otherCurrencies || {}).map(([cur, o]) => (
            <AppText key={cur} variant="caption" color={colors.textSecondary} style={styles.mt}>
              En {cur} (no se suma a los totales en MXN): líquido {formatMoney(o.liquid, cur)}{o.creditDebt ? ` · deuda ${formatMoney(o.creditDebt, cur)}` : ''}
            </AppText>
          ))}
        </Card>
      ) : (
        <EmptyState icon="wallet" title="Sin cuentas todavía" message="Crea una cuenta por cada lugar donde tienes dinero: efectivo, débito, ahorro o tarjetas de crédito." />
      )}
      <Button title="Nueva cuenta" icon="plus" onPress={() => navigation.navigate(ROUTES.CUENTA_FORM)} style={styles.mtLg} />
      {liquid.length ? <SectionHeader title="Efectivo, débito y ahorro" /> : null}
      {liquid.map((a, i) => <AccountCard key={a.id} account={a} index={i + 1} onPress={() => navigation.navigate(ROUTES.CUENTA_DETALLE, { id: a.id })} />)}
      {credit.length ? <SectionHeader title="Crédito" /> : null}
      {credit.map((a, i) => <AccountCard key={a.id} account={a} index={i + liquid.length + 1} onPress={() => navigation.navigate(ROUTES.CUENTA_DETALLE, { id: a.id })} />)}
      {data.archived.length ? (
        <SectionHeader title={`Archivadas (${data.archived.length})`} action={showArchived ? 'Ocultar' : 'Mostrar'} onAction={() => setShowArchived(s => !s)} />
      ) : null}
      {showArchived ? data.archived.map(a => <AccountCard key={a.id} account={{ ...a, debt: Math.max(0, -a.balance) }} animate={false} onPress={() => navigation.navigate(ROUTES.CUENTA_DETALLE, { id: a.id })} />) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
  mt: { marginTop: 6 },
  mtLg: { marginTop: spacing.lg },
});
