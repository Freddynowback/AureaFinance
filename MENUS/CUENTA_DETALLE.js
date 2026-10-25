/**
 * CUENTA_DETALLE — saldo, movimientos de la cuenta y conciliación de saldo.
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, spacing } from '../config/theme';
import { ROUTES } from '../navigation/routes';
import { useDb } from '../hooks/DatabaseProvider';
import { useQuery } from '../hooks/useQuery';
import { useSettings } from '../hooks/useSettings';
import { useSubmit } from '../hooks/useSubmit';
import { transactionsRepository } from '../database/repositories/transactionsRepository';
import { accountsRepository } from '../database/repositories/accountsRepository';
import { archiveAccount, deleteAccount, getAccountsOverview, reconcileAccount } from '../services/accounts/accountService';
import { listDebts } from '../services/debts/debtService';
import { buildInstallmentPlan, PLAN_FREQUENCIES, PLAN_LABELS, planFrequency } from '../services/debts/recommender';
import { ACCOUNT_TYPE_LABELS } from '../services/transactions/rules';
import { formatDate, todayISO } from '../utils/dates';
import { formatMoney } from '../utils/money';
import AmountField from '../components/common/AmountField';
import AppText from '../components/common/AppText';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import ConfirmSheet from '../components/common/ConfirmSheet';
import EmptyState from '../components/common/EmptyState';
import ListRow from '../components/common/ListRow';
import Screen from '../components/common/Screen';
import SectionHeader from '../components/common/SectionHeader';
import Segmented from '../components/common/Segmented';
import Sheet from '../components/common/Sheet';
import TextField from '../components/common/TextField';
import TransactionCard from '../components/TransactionCard';
import CreditUsage from '../components/CreditUsage';
import { creditSummary } from '../services/accounts/creditService';

async function load(db, id) {
  const [overview, recent, count, debts] = await Promise.all([
    getAccountsOverview(db),
    transactionsRepository.search(db, { accountId: id }, { limit: 15 }),
    transactionsRepository.count(db, { accountId: id }),
    listDebts(db),
  ]);
  // Las cuentas archivadas no están en el resumen: se leen directamente.
  const account = overview.accounts.find(a => a.id === id) || (await accountsRepository.get(db, id));
  return { account, recent, count, debts: debts.filter(d => d.account_id === id) };
}

export default function CUENTA_DETALLE({ navigation, route }) {
  const db = useDb();
  const id = route.params.id;
  const { data, loading } = useQuery(d => load(d, id), [id]);
  const { submit, saving, errors } = useSubmit();
  const { settings, update } = useSettings();
  const [reconcile, setReconcile] = useState(false);
  const [actual, setActual] = useState(null);
  const [note, setNote] = useState('');
  const [confirm, setConfirm] = useState(null);

  if (loading && !data) return <Screen />;
  if (!data || !data.account) return <Screen><EmptyState icon="wallet" title="Cuenta no encontrada" /></Screen>;
  const a = data.account;
  const isCredit = a.type === 'credit';
  const debt = Math.max(0, -a.balance);
  // Plan para el pago de lo no financiado (las financiaciones tienen el suyo).
  const revolving = isCredit && a.credit ? Math.min(a.credit.revolving, debt) : 0;
  const frequency = settings ? planFrequency(settings['plan.frequency'], id, settings['period.type']) : null;
  const cardPlan = revolving > 0 && a.nextDue && frequency
    ? buildInstallmentPlan({ installments: [{ date: a.nextDue, amount: revolving }], today: todayISO(), frequency })
    : null;

  return (
    <Screen>
      <AppText variant="caption" color={colors.textSecondary}>{ACCOUNT_TYPE_LABELS[a.type]}{a.institution ? ` · ${a.institution}` : ''} · {a.currency}{a.status === 'archived' ? ' · archivada' : ''}</AppText>
      <AppText variant="title" style={styles.mt}>{a.name}</AppText>
      <Card style={styles.mtLg}>
        <AppText variant="label" color={colors.textSecondary}>{isCredit ? 'Deuda actual' : 'Saldo actual'}</AppText>
        <AppText variant="display" color={isCredit && debt ? colors.coral : a.balance < 0 ? colors.coral : colors.text} style={styles.mt}>{formatMoney(isCredit ? debt : a.balance, a.currency)}</AppText>
        {isCredit ? <View style={styles.mtLg}><CreditUsage summary={a.credit || creditSummary(a)} currency={a.currency} /></View> : null}
        {isCredit && (a.nextStatement || a.nextDue) ? (
          <AppText variant="caption" color={colors.gold} style={styles.mt}>
            {a.nextStatement ? `Próximo corte ${formatDate(a.nextStatement)}` : ''}{a.nextStatement && a.nextDue ? ' · ' : ''}{a.nextDue ? `Pago límite ${formatDate(a.nextDue)}` : ''}
          </AppText>
        ) : null}
        {cardPlan ? (
          <View style={styles.mtLg}>
            <AppText variant="label" color={colors.textSecondary}>Apartar para el pago</AppText>
            <Segmented
              options={PLAN_FREQUENCIES.map(v => ({ value: v, label: PLAN_LABELS[v] }))}
              value={frequency}
              onChange={f => update({ 'plan.frequency': { ...settings['plan.frequency'], [id]: f } })}
              style={styles.mt}
            />
            <AppText variant="caption" color={colors.textSecondary} style={styles.mt}>
              Aparta {formatMoney(cardPlan.perPeriod, a.currency)} {cardPlan.perLabel} ({cardPlan.periods} {cardPlan.periods === 1 ? 'aportación' : 'aportaciones'}) para pagar {formatMoney(revolving, a.currency)} el {formatDate(a.nextDue)}. Se usa en "Gasto de hoy".
            </AppText>
          </View>
        ) : null}
        <AppText variant="caption" color={colors.textMuted} style={styles.mt}>
          Saldo inicial {formatMoney(isCredit ? -a.initial_balance : a.initial_balance, a.currency)} al {formatDate(a.initial_balance_date)} + {data.count} movimientos.
        </AppText>
      </Card>

      <View style={styles.row}>
        {isCredit ? <Button title="Pagar tarjeta" icon="card" style={styles.flex} onPress={() => navigation.navigate(ROUTES.MOVIMIENTO_FORM, { kind: 'card_payment', prefill: { to_account_id: id } })} /> : <Button title="Transferir" icon="transfer" style={styles.flex} onPress={() => navigation.navigate(ROUTES.MOVIMIENTO_FORM, { kind: 'transfer', prefill: { account_id: id } })} />}
        <Button title="Conciliar saldo" icon="sliders" variant="secondary" style={styles.flex} onPress={() => { setActual(isCredit ? debt : a.balance); setNote(''); setReconcile(true); }} />
      </View>

      {data.debts.length ? (
        <>
          <SectionHeader title="Financiaciones en esta tarjeta" action="Nueva" onAction={() => navigation.navigate(ROUTES.DEUDA_FORM, { accountId: id })} />
          <Card>
            {data.debts.map((d, i) => <ListRow key={d.id} icon="receipt" iconColor={colors.coral} title={d.name} right={formatMoney(Math.max(0, d.outstanding))} onPress={() => navigation.navigate(ROUTES.DEUDA_DETALLE, { id: d.id })} last={i === data.debts.length - 1} />)}
          </Card>
        </>
      ) : isCredit ? (
        <Button title="Registrar financiación de esta tarjeta" variant="ghost" icon="plus" style={styles.mt} onPress={() => navigation.navigate(ROUTES.DEUDA_FORM, { accountId: id })} />
      ) : null}

      <SectionHeader title="Movimientos" action={data.count > data.recent.length ? `Ver los ${data.count}` : null} onAction={() => navigation.navigate(ROUTES.TABS, { screen: ROUTES.MOVIMIENTOS, params: { accountId: id } })} />
      {data.recent.length ? (
        <Card style={styles.list}>{data.recent.map(t => <TransactionCard key={t.id} tx={t} accountId={id} onPress={() => navigation.navigate(ROUTES.MOVIMIENTO_DETALLE, { id: t.id })} />)}</Card>
      ) : <EmptyState compact icon="receipt" title="Sin movimientos" />}

      <View style={[styles.row, styles.mtLg]}>
        <Button title="Editar" icon="edit" variant="secondary" style={styles.flex} onPress={() => navigation.navigate(ROUTES.CUENTA_FORM, { id })} />
        <Button title={a.status === 'archived' ? 'Restaurar' : 'Archivar'} icon="archive" variant="secondary" style={styles.flex} onPress={() => setConfirm('archive')} />
      </View>
      {data.count === 0 ? <Button title="Eliminar cuenta" icon="trash" variant="danger" style={styles.mt} onPress={() => setConfirm('delete')} /> : (
        <AppText variant="caption" color={colors.textMuted} style={styles.mt}>Una cuenta con movimientos no se elimina para conservar tu historial; puedes archivarla.</AppText>
      )}

      <Sheet visible={reconcile} onClose={() => setReconcile(false)} title="Conciliar saldo" footer={<Button title="Guardar ajuste" loading={saving} onPress={() => submit(() => reconcileAccount(db, id, actual, { note: note || undefined }), { success: 'Saldo conciliado', onDone: () => setReconcile(false) })} />}>
        <AppText variant="small" color={colors.textSecondary} style={styles.mb}>
          Escribe {isCredit ? 'la deuda real' : 'el saldo real'} que ves en tu banco o en tu cartera. Se creará un movimiento de "Ajuste de saldo" por la diferencia: no cuenta como gasto ni como ingreso.
        </AppText>
        <AmountField label={isCredit ? 'Crédito en uso real (deuda total, incluidas financiaciones)' : 'Saldo real'} value={actual} onChange={setActual} allowNegative={!isCredit} error={errors.amount} autoFocus />
        {Number.isInteger(actual) ? (
          <AppText variant="small" color={colors.textSecondary} style={styles.mb}>
            Diferencia: {formatMoney((isCredit ? -actual : actual) - a.balance, a.currency, { sign: true })}
          </AppText>
        ) : null}
        <TextField label="Nota (opcional)" value={note} onChangeText={setNote} placeholder="Conciliación con estado de cuenta" />
      </Sheet>

      <ConfirmSheet
        visible={confirm === 'archive'}
        title={a.status === 'archived' ? 'Restaurar cuenta' : 'Archivar cuenta'}
        message={a.status === 'archived' ? 'La cuenta volverá a aparecer en tus listas y saldos.' : 'La cuenta dejará de aparecer en listas y saldos, pero su historial se conserva.'}
        onCancel={() => setConfirm(null)}
        onConfirm={() => submit(() => archiveAccount(db, id, a.status !== 'archived'), { success: 'Cuenta actualizada', onDone: () => setConfirm(null) })}
      />
      <ConfirmSheet
        visible={confirm === 'delete'}
        title="Eliminar cuenta"
        message="La cuenta no tiene movimientos y se eliminará definitivamente."
        danger
        confirmLabel="Eliminar"
        onCancel={() => setConfirm(null)}
        onConfirm={() => submit(() => deleteAccount(db, id), { success: 'Cuenta eliminada', onDone: () => { setConfirm(null); navigation.goBack(); } })}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  mt: { marginTop: spacing.sm },
  mtLg: { marginTop: spacing.lg },
  mb: { marginBottom: spacing.lg, lineHeight: 19 },
  row: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  flex: { flex: 1 },
  list: { paddingVertical: spacing.xs },
});
