/**
 * DEUDA_FORM — registrar o editar una deuda/financiación (datos manuales).
 * Se paga con un pago mensual fijo o con un calendario: los meses que muestra
 * el banco, capturados a mano (nunca calculados).
 */
import React, { useEffect, useLayoutEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '../config/theme';
import { useDb } from '../hooks/DatabaseProvider';
import { useQuery } from '../hooks/useQuery';
import { useSubmit } from '../hooks/useSubmit';
import { accountsRepository } from '../database/repositories/accountsRepository';
import { debtsRepository } from '../database/repositories/debtsRepository';
import { createDebt, FINANCING_LABELS, updateDebt } from '../services/debts/debtService';
import { scheduleStatus } from '../services/debts/schedule';
import { refreshScheduledNotifications } from '../services/notifications/notificationService';
import { addMonths, todayISO } from '../utils/dates';
import AmountField from '../components/common/AmountField';
import AppText from '../components/common/AppText';
import Button from '../components/common/Button';
import DateTimeField from '../components/common/DateTimeField';
import Screen from '../components/common/Screen';
import Segmented from '../components/common/Segmented';
import { formatMoney } from '../utils/money';

import SelectField from '../components/common/SelectField';
import TextField from '../components/common/TextField';

const onlyInt = t => (t.replace(/\D/g, '') ? Number(t.replace(/\D/g, '')) : null);
let rowKey = 0;
const newRow = (due_date, amount = null) => ({ key: `m${++rowKey}`, due_date, amount });

export default function DEUDA_FORM({ navigation, route }) {
  const db = useDb();
  const id = route.params && route.params.id;
  const { data: cards = [] } = useQuery(d => accountsRepository.list(d).then(l => l.filter(a => a.type === 'credit')), []);
  const [form, setForm] = useState({
    name: '', account_id: (route.params && route.params.accountId) || null, financing_type: 'msi', balance: null, balance_date: todayISO(),
    monthly_payment: null, next_due_date: null, statement_day: null, installments_remaining: null, interest_rate_bp: null, notes: '',
    included: null, // ¿el saldo ya está en la deuda de la tarjeta? null = sin elegir
  });
  const [rateText, setRateText] = useState('');
  const [mode, setMode] = useState('fixed'); // 'fixed' | 'schedule'
  const [hadSchedule, setHadSchedule] = useState(false);
  const [rows, setRows] = useState(() => [newRow(todayISO())]);
  const { submit, saving, errors } = useSubmit();
  const set = p => setForm(f => ({ ...f, ...p }));
  const selectedCard = cards.find(c => c.id === form.account_id) || null;

  useLayoutEffect(() => navigation.setOptions({ title: id ? 'Editar deuda' : 'Nueva deuda' }), [navigation, id]);
  useEffect(() => {
    if (!id) return;
    Promise.all([debtsRepository.get(db, id), debtsRepository.scheduleItems(db, id)]).then(([d, items]) => {
      if (!d) return;
      setForm({ ...d });
      setRateText(d.interest_rate_bp !== null ? String(d.interest_rate_bp / 100) : '');
      if (items.length) {
        // Se editan los meses que faltan (el del mes, con lo que queda por pagar).
        const { pending } = scheduleStatus(items, d.outstanding);
        setMode('schedule');
        setHadSchedule(true);
        setRows(pending.length ? pending.map(p => newRow(p.due_date, p.amount)) : [newRow(todayISO())]);
      }
    });
  }, [db, id]);
  useEffect(() => {
    if (!form.account_id && cards.length === 1) set({ account_id: cards[0].id });
  }, [cards, form.account_id]);

  const save = () =>
    submit(
      async () => {
        const rate = rateText.trim() ? Math.round(parseFloat(rateText.replace(',', '.')) * 100) : null;
        if (!id && form.included === null) {
          throw Object.assign(new Error('Indica si este saldo ya está incluido en la deuda de la tarjeta'), {
            fields: { included: 'Elige una opción' },
          });
        }
        const input = { ...form, interest_rate_bp: Number.isFinite(rate) ? rate : null, addToCardDebt: form.included === false };
        if (mode === 'schedule') input.schedule = rows.map(r => ({ due_date: r.due_date, amount: r.amount }));
        else if (hadSchedule) input.schedule = null; // pasa a pago mensual fijo
        return id ? updateDebt(db, id, input) : createDebt(db, input);
      },
      {
        success: id ? 'Deuda actualizada' : 'Deuda registrada',
        onDone: () => {
          refreshScheduledNotifications(db).catch(() => {});
          navigation.goBack();
        },
      },
    );

  const scheduleTotal = rows.reduce((s, r) => s + (Number.isInteger(r.amount) ? r.amount : 0), 0);
  const balanceForPreview = mode === 'schedule' ? scheduleTotal : form.balance;
  const setRow = (key, patch) => setRows(rs => rs.map(r => (r.key === key ? { ...r, ...patch } : r)));
  const addRow = () => setRows(rs => [...rs, newRow(rs.length ? addMonths(rs[rs.length - 1].due_date, 1) : todayISO())]);
  const removeRow = key => setRows(rs => (rs.length > 1 ? rs.filter(r => r.key !== key) : rs));

  return (
    <Screen footer={<Button title="Guardar" onPress={save} loading={saving} />}>
      <TextField label="Nombre" placeholder="Ej. Celular a 18 MSI" value={form.name} onChangeText={name => set({ name })} error={errors.name} />
      <SelectField
        label="Tarjeta o cuenta de crédito"
        value={form.account_id}
        onChange={account_id => set({ account_id })}
        options={cards.map(c => ({ value: c.id, label: c.name, sublabel: c.institution || undefined, icon: 'card', color: colors.coral }))}
        error={errors.account_id}
        emptyText="Crea primero una cuenta de tipo crédito."
      />
      <SelectField label="Tipo de financiación" value={form.financing_type} onChange={financing_type => set({ financing_type })} options={Object.entries(FINANCING_LABELS).map(([value, label]) => ({ value, label }))} />
      <AppText variant="caption" color={colors.textSecondary} style={styles.label}>¿Cómo se paga?</AppText>
      <Segmented
        options={[{ value: 'fixed', label: 'Pago mensual fijo' }, { value: 'schedule', label: 'Calendario de pagos' }]}
        value={mode}
        onChange={setMode}
      />
      {mode === 'schedule' ? (
        <View style={styles.schedule}>
          <AppText variant="caption" color={colors.textMuted} style={styles.help}>
            Captura cada mes que te muestra tu banco con su monto (por ejemplo, los pagos de los siguientes meses en la app de NU). El saldo pendiente será la suma de estos meses. Útil cuando varias compras a meses están revueltas y solo ves el total de cada mes.
          </AppText>
          {rows.map((r, i) => (
            <View key={r.key} style={styles.row}>
              <DateTimeField label={`Mes ${i + 1}: fecha de pago`} mode="date" value={r.due_date} onChange={due_date => setRow(r.key, { due_date })} error={errors[`schedule.${i}.due_date`]} />
              <AmountField label={`Mes ${i + 1}: monto`} value={r.amount} onChange={amount => setRow(r.key, { amount })} error={errors[`schedule.${i}.amount`]} />
              {rows.length > 1 ? <Button title={`Quitar mes ${i + 1}`} icon="trash" variant="ghost" small onPress={() => removeRow(r.key)} /> : null}
            </View>
          ))}
          <Button title="Agregar mes" icon="plus" variant="secondary" small onPress={addRow} />
          <AppText variant="small" style={styles.total}>
            Saldo pendiente (suma de los meses): {formatMoney(scheduleTotal)}
          </AppText>
          {id ? (
            <AppText variant="caption" color={colors.textMuted} style={styles.note}>
              Aquí están solo los meses que faltan. Si su suma cambia el saldo pendiente, se guarda como conciliación con historial (no es un gasto).
            </AppText>
          ) : null}
          {errors.schedule ? <AppText variant="caption" color={colors.coral} style={styles.note}>{errors.schedule}</AppText> : null}
        </View>
      ) : <View style={styles.gap} />}
      {!id ? (
        <>
          {mode === 'fixed' ? (
            <>
              <AmountField label="Saldo pendiente actual (total financiado que falta)" value={form.balance} onChange={balance => set({ balance })} error={errors.balance} hint="El total que aún debes de esta financiación (no solo el pago del mes), según tu estado de cuenta o app del banco." />
              <DateTimeField label="Fecha de ese saldo" mode="date" value={form.balance_date} onChange={balance_date => set({ balance_date })} />
            </>
          ) : null}
          <AppText variant="caption" color={errors.included ? colors.coral : colors.textSecondary} style={{ marginBottom: 8 }}>
            ¿Este saldo ya está incluido en la deuda actual de la tarjeta?{errors.included ? ` · ${errors.included}` : ''}
          </AppText>
          <Segmented
            options={[{ value: true, label: 'Sí, ya lo incluye' }, { value: false, label: 'No, súmalo' }]}
            value={form.included}
            onChange={included => set({ included })}
          />
          {selectedCard ? (
            <AppText variant="caption" color={colors.textMuted} style={{ marginTop: 6, marginBottom: 16 }}>
              Deuda registrada hoy en {selectedCard.name}: {formatMoney(Math.max(0, -selectedCard.balance))}.
              {form.included === false && Number.isInteger(balanceForPreview) ? ` Quedará en ${formatMoney(Math.max(0, -selectedCard.balance) + balanceForPreview)} (ajuste de saldo, no es un gasto).` : ''}
              {form.included === true ? ' No se modifica la deuda de la tarjeta.' : ''}
            </AppText>
          ) : <View style={{ height: 16 }} />}
        </>
      ) : mode === 'fixed' ? (
        <AppText variant="caption" color={colors.textSecondary} style={{ marginBottom: 16 }}>Para cambiar el saldo pendiente usa "Actualizar saldo" en el detalle: se guarda como conciliación con historial.</AppText>
      ) : null}
      {mode === 'fixed' ? (
        <>
          <AmountField label="Pago mensual (si existe)" value={form.monthly_payment ?? null} onChange={monthly_payment => set({ monthly_payment })} error={errors.monthly_payment} />
          <DateTimeField label="Próximo vencimiento" mode="date" value={form.next_due_date} onChange={next_due_date => set({ next_due_date })} optional onClear={() => set({ next_due_date: null })} error={errors.next_due_date} />
        </>
      ) : null}
      <TextField label="Día de corte (opcional)" keyboardType="number-pad" value={form.statement_day ? String(form.statement_day) : ''} onChangeText={t => set({ statement_day: onlyInt(t) })} error={errors.statement_day} />
      {mode === 'fixed' ? <TextField label="Cuotas restantes (si las conoces)" keyboardType="number-pad" value={form.installments_remaining !== null && form.installments_remaining !== undefined ? String(form.installments_remaining) : ''} onChangeText={t => set({ installments_remaining: onlyInt(t) })} error={errors.installments_remaining} /> : null}
      <TextField label="Tasa de interés anual % (opcional)" keyboardType="decimal-pad" placeholder="Desconocida" value={rateText} onChangeText={setRateText} error={errors.interest_rate_bp} hint="Solo informativa: el recomendador no estima intereses." />
      <TextField label="Notas" value={form.notes || ''} onChangeText={notes => set({ notes })} multiline />
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: 8 },
  schedule: { marginTop: 12, marginBottom: 8 },
  help: { marginBottom: 12 },
  row: { marginBottom: 4 },
  total: { marginTop: 12 },
  note: { marginTop: 4 },
  gap: { height: 12 },
});
