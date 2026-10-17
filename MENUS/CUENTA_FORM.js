/**
 * CUENTA_FORM — alta y edición de cuentas. Los datos bancarios (límite,
 * corte, pago) los escribe el usuario: la app no los inventa.
 */
import React, { useEffect, useLayoutEffect, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { colors, spacing } from '../config/theme';
import { CURRENCY_LIST } from '../config/currencies';
import { useDb } from '../hooks/DatabaseProvider';
import { useSubmit } from '../hooks/useSubmit';
import { accountsRepository } from '../database/repositories/accountsRepository';
import { createAccount, updateAccount } from '../services/accounts/accountService';
import { refreshScheduledNotifications } from '../services/notifications/notificationService';
import { ACCOUNT_TYPE_LABELS } from '../services/transactions/rules';
import { todayISO } from '../utils/dates';
import AmountField from '../components/common/AmountField';
import AppText from '../components/common/AppText';
import Button from '../components/common/Button';
import DateTimeField from '../components/common/DateTimeField';
import Screen from '../components/common/Screen';
import Segmented from '../components/common/Segmented';
import SelectField from '../components/common/SelectField';
import TextField from '../components/common/TextField';

const dayOrNull = t => (t.replace(/\D/g, '') ? Number(t.replace(/\D/g, '')) : null);

export default function CUENTA_FORM({ navigation, route }) {
  const db = useDb();
  const id = route.params && route.params.id;
  const [form, setForm] = useState({
    name: '', type: (route.params && route.params.type) || 'debit', institution: '', currency: 'MXN', openingAmount: 0,
    initial_balance_date: todayISO(), credit_limit: null, statement_day: null, payment_due_day: null, include_in_liquid: true, notes: '',
  });
  const { submit, saving, errors } = useSubmit();
  const set = p => setForm(f => ({ ...f, ...p }));
  useLayoutEffect(() => navigation.setOptions({ title: id ? 'Editar cuenta' : 'Nueva cuenta' }), [navigation, id]);
  useEffect(() => {
    if (!id) return;
    accountsRepository.get(db, id).then(a => a && setForm({
      ...a,
      openingAmount: a.type === 'credit' ? -a.initial_balance : a.initial_balance,
      include_in_liquid: !!a.include_in_liquid,
    }));
  }, [db, id]);
  const isCredit = form.type === 'credit';
  const save = () =>
    submit(() => (id ? updateAccount(db, id, form) : createAccount(db, form)), {
      success: id ? 'Cuenta actualizada' : 'Cuenta creada',
      onDone: () => {
        if (isCredit) refreshScheduledNotifications(db).catch(() => {});
        navigation.goBack();
      },
    });
  return (
    <Screen footer={<Button title="Guardar" onPress={save} loading={saving} />}>
      {!id ? (
        <View style={styles.block}>
          <AppText variant="caption" color={colors.textSecondary} style={styles.label}>Tipo de cuenta</AppText>
          <Segmented options={['cash', 'debit', 'savings', 'credit', 'other'].map(t => ({ value: t, label: ACCOUNT_TYPE_LABELS[t] }))} value={form.type} onChange={type => set({ type })} />
        </View>
      ) : <AppText variant="caption" color={colors.textSecondary} style={styles.block}>Tipo: {ACCOUNT_TYPE_LABELS[form.type]} (no se puede cambiar para no alterar el historial)</AppText>}
      <TextField label="Nombre" placeholder={isCredit ? 'Ej. Tarjeta Oro' : 'Ej. Nómina'} value={form.name} onChangeText={name => set({ name })} error={errors.name} />
      {form.type !== 'cash' ? <TextField label="Banco o entidad (opcional)" value={form.institution || ''} onChangeText={institution => set({ institution })} /> : null}
      <AmountField
        label={isCredit ? 'Deuda actual' : 'Saldo actual'}
        value={form.openingAmount}
        onChange={openingAmount => set({ openingAmount: openingAmount ?? 0 })}
        allowNegative={!isCredit}
        error={errors.openingAmount}
        hint={isCredit ? 'Lo que debes hoy en esta tarjeta (0 si no debes nada).' : 'Lo que tienes hoy en esta cuenta.'}
      />
      <DateTimeField label="Saldo a la fecha" mode="date" value={form.initial_balance_date} onChange={initial_balance_date => set({ initial_balance_date })} error={errors.initial_balance_date} />
      <AppText variant="caption" color={colors.textMuted} style={styles.note}>Los movimientos con fecha anterior a esta ya están incluidos en el saldo y no lo modifican.</AppText>
      {isCredit ? (
        <>
          <AmountField label="Crédito total autorizado (límite)" value={form.credit_limit} onChange={credit_limit => set({ credit_limit })} error={errors.credit_limit} hint="El límite que te da el banco (p. ej. 4,000). Con él la app calcula tu crédito disponible real." />
          <View style={styles.row}>
            <View style={styles.flex}><TextField label="Día de corte" keyboardType="number-pad" value={form.statement_day ? String(form.statement_day) : ''} onChangeText={t => set({ statement_day: dayOrNull(t) })} error={errors.statement_day} placeholder="1-31" /></View>
            <View style={styles.flex}><TextField label="Día límite de pago" keyboardType="number-pad" value={form.payment_due_day ? String(form.payment_due_day) : ''} onChangeText={t => set({ payment_due_day: dayOrNull(t) })} error={errors.payment_due_day} placeholder="1-31" /></View>
          </View>
          <AppText variant="caption" color={colors.textMuted} style={styles.note}>Consulta estos datos en tu estado de cuenta. Si el mes no tiene ese día se usa el último día del mes.</AppText>
        </>
      ) : (
        <View style={styles.switchRow}>
          <View style={styles.flex}>
            <AppText>Incluir en dinero disponible</AppText>
            <AppText variant="caption" color={colors.textSecondary}>Desactívalo para ahorros que no quieres contar como gastables.</AppText>
          </View>
          <Switch value={!!form.include_in_liquid} onValueChange={include_in_liquid => set({ include_in_liquid })} trackColor={{ true: colors.teal, false: colors.border }} thumbColor={colors.text} />
        </View>
      )}
      <SelectField label="Moneda" value={form.currency} onChange={currency => set({ currency })} options={CURRENCY_LIST.map(c => ({ value: c.code, label: `${c.code} · ${c.name}` }))} hint="Las transferencias solo se permiten entre cuentas de la misma moneda." />
      <TextField label="Notas" value={form.notes || ''} onChangeText={notes => set({ notes })} multiline />
    </Screen>
  );
}

const styles = StyleSheet.create({
  block: { marginBottom: spacing.lg },
  label: { marginBottom: 8 },
  note: { marginTop: -8, marginBottom: spacing.lg },
  row: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
  switchRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg, gap: spacing.md },
});
