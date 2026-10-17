import React, { useEffect, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { colors, spacing } from '../config/theme';
import { useDb } from '../hooks/DatabaseProvider';
import { useQuery } from '../hooks/useQuery';
import { useSubmit } from '../hooks/useSubmit';
import { accountsRepository } from '../database/repositories/accountsRepository';
import { categoriesRepository } from '../database/repositories/categoriesRepository';
import { recurringRepository } from '../database/repositories/recurringRepository';
import { createRule, deleteRule, syncRecurring, updateRule } from '../services/recurring/recurringService';
import { refreshScheduledNotifications } from '../services/notifications/notificationService';
import { INCOME_TYPE_LABELS, PAYMENT_METHOD_LABELS } from '../services/transactions/rules';
import { FREQUENCY_LABELS } from '../utils/periods';
import { todayISO } from '../utils/dates';
import AppText from '../components/common/AppText';
import AmountField from '../components/common/AmountField';
import Button from '../components/common/Button';
import ConfirmSheet from '../components/common/ConfirmSheet';
import DateTimeField from '../components/common/DateTimeField';
import Screen from '../components/common/Screen';
import Segmented from '../components/common/Segmented';
import SelectField from '../components/common/SelectField';
import TextField from '../components/common/TextField';

const EMPTY = {
  kind: 'income',
  name: '',
  amount: null,
  account_id: '',
  category_id: '',
  payment_method: 'debit',
  income_type: 'salary',
  frequency: 'monthly',
  interval_days: 1,
  start_date: todayISO(),
  end_date: null,
  auto_post: false,
  status: 'active',
  notes: '',
};

const KIND_OPTIONS = [{ value: 'income', label: 'Ingreso' }, { value: 'expense', label: 'Gasto' }];
const PAYMENT_OPTIONS = ['cash', 'debit', 'credit', 'other'].map(value => ({ value, label: PAYMENT_METHOD_LABELS[value] }));

export default function RECURRENTE_FORM({ navigation, route }) {
  const db = useDb();
  const params = route.params || {};
  const id = params.id || null;
  const [form, setForm] = useState({ ...EMPTY, kind: params.kind || EMPTY.kind });
  const [loaded, setLoaded] = useState(!id);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { data: accounts = [] } = useQuery(d => accountsRepository.list(d), []);
  const { data: categories = [] } = useQuery(d => categoriesRepository.list(d), []);
  const { submit, saving, errors } = useSubmit();

  useEffect(() => {
    if (!id) return;
    recurringRepository.getRule(db, id).then(rule => {
      if (rule) setForm({ ...EMPTY, ...rule, auto_post: !!rule.auto_post, end_date: rule.end_date || null, interval_days: rule.interval_days || 1 });
      setLoaded(true);
    });
  }, [db, id]);

  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const save = () => submit(
    async () => {
      const rule = id ? await updateRule(db, id, form) : await createRule(db, form);
      // Aplica en el momento las ocurrencias automáticas ya vencidas (idempotente).
      await syncRecurring(db);
      refreshScheduledNotifications(db).catch(() => {});
      return rule;
    },
    { success: id ? 'Recurrencia actualizada' : 'Recurrencia creada', onDone: () => navigation.goBack() },
  );
  const remove = () => submit(
    () => deleteRule(db, id),
    { success: 'Recurrencia eliminada', onDone: () => { setConfirmDelete(false); navigation.goBack(); } },
  );

  if (!loaded) return <Screen />;
  const categoryOptions = categories
    .filter(category => category.kind === form.kind || category.kind === 'both')
    .map(category => ({ value: category.id, label: category.name, icon: category.icon, color: category.color }));
  const accountOptions = accounts
    .filter(account => form.kind !== 'income' || account.type !== 'credit')
    .map(account => ({ value: account.id, label: account.name, sublabel: account.type === 'credit' ? 'Crédito' : 'Cuenta' }));
  return (
    <Screen footer={<Button title={id ? 'Guardar cambios' : 'Guardar recurrencia'} onPress={save} loading={saving} />}>
      {!id ? (
        <>
          <AppText variant="caption" color={colors.textSecondary} style={styles.label}>Tipo</AppText>
          <Segmented options={KIND_OPTIONS} value={form.kind} onChange={kind => setForm(current => ({ ...current, kind, category_id: null, payment_method: kind === 'expense' ? current.payment_method : null }))} style={styles.control} />
        </>
      ) : null}
      <TextField label="Nombre" value={form.name} onChangeText={value => set('name', value)} error={errors.name} placeholder={form.kind === 'income' ? 'Ej. Nómina' : 'Ej. Renta'} />
      <AmountField label="Importe" value={form.amount} onChange={value => set('amount', value)} error={errors.amount} large />
      <SelectField label="Cuenta" value={form.account_id} options={accountOptions} onChange={value => set('account_id', value)} error={errors.account_id} placeholder="Selecciona una cuenta" emptyText="No hay cuentas activas disponibles." />
      {form.kind === 'expense' ? (
        <>
          <SelectField label="Categoría" value={form.category_id} options={categoryOptions} onChange={value => set('category_id', value)} error={errors.category_id} placeholder="Selecciona una categoría" emptyText="No hay categorías de gasto activas." />
          <AppText variant="caption" color={colors.textSecondary} style={styles.label}>Método de pago</AppText>
          <Segmented options={PAYMENT_OPTIONS} value={form.payment_method} onChange={value => set('payment_method', value)} style={styles.control} />
        </>
      ) : (
        <SelectField label="Tipo de ingreso" value={form.income_type} options={Object.entries(INCOME_TYPE_LABELS).map(([value, label]) => ({ value, label }))} onChange={value => set('income_type', value)} />
      )}
      <SelectField label="Frecuencia" value={form.frequency} options={Object.entries(FREQUENCY_LABELS).map(([value, label]) => ({ value, label }))} onChange={value => set('frequency', value)} error={errors.frequency} />
      {form.frequency === 'custom' ? <TextField label="Cada cuántos días" value={String(form.interval_days || '')} onChangeText={value => set('interval_days', value.replace(/\D/g, ''))} error={errors.interval_days} keyboardType="number-pad" /> : null}
      <DateTimeField label="Fecha de inicio" mode="date" value={form.start_date} onChange={value => set('start_date', value)} error={errors.start_date} />
      <DateTimeField label="Fecha final (opcional)" mode="date" value={form.end_date} onChange={value => set('end_date', value)} optional onClear={() => set('end_date', null)} error={errors.end_date} />
      <Toggle title="Registrar automáticamente en la fecha" value={!!form.auto_post} onChange={value => set('auto_post', value)} hint="Si lo activas, la app creará el movimiento sola el día previsto (automatización local). Si no, te avisará y tú confirmas cuando lo recibas/pagues." />
      <Toggle title="Activa" value={form.status === 'active'} onChange={value => set('status', value ? 'active' : 'paused')} hint="Las reglas pausadas no generan nuevas ocurrencias." />
      <TextField label="Notas" value={form.notes || ''} onChangeText={value => set('notes', value)} multiline placeholder="Información adicional" />
      {id ? <Button title="Eliminar recurrencia" variant="danger" onPress={() => setConfirmDelete(true)} disabled={saving} style={styles.delete} /> : null}
      <ConfirmSheet visible={confirmDelete} title="Eliminar recurrencia" message="Se eliminará esta regla. Los movimientos ya registrados se conservan." confirmLabel="Eliminar" danger onCancel={() => setConfirmDelete(false)} onConfirm={remove} loading={saving} />
    </Screen>
  );
}

function Toggle({ title, value, onChange, hint }) {
  return (
    <View style={styles.switchRow}>
      <View style={styles.flex}><AppText variant="subtitle">{title}</AppText><AppText variant="caption" color={colors.textSecondary} style={styles.switchHint}>{hint}</AppText></View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.teal, false: colors.border }} thumbColor={colors.text} accessibilityLabel={title} />
    </View>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: spacing.sm },
  control: { marginBottom: spacing.lg },
  switchRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
  flex: { flex: 1 },
  switchHint: { lineHeight: 18, marginTop: spacing.xs, paddingRight: spacing.md },
  delete: { marginTop: spacing.md, marginBottom: spacing.lg },
});
