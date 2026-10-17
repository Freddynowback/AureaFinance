/**
 * DEUDA_FORM — registrar o editar una deuda/financiación (datos manuales).
 */
import React, { useEffect, useLayoutEffect, useState } from 'react';
import { View } from 'react-native';
import { colors } from '../config/theme';
import { useDb } from '../hooks/DatabaseProvider';
import { useQuery } from '../hooks/useQuery';
import { useSubmit } from '../hooks/useSubmit';
import { accountsRepository } from '../database/repositories/accountsRepository';
import { debtsRepository } from '../database/repositories/debtsRepository';
import { createDebt, FINANCING_LABELS, updateDebt } from '../services/debts/debtService';
import { refreshScheduledNotifications } from '../services/notifications/notificationService';
import { todayISO } from '../utils/dates';
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
  const { submit, saving, errors } = useSubmit();
  const set = p => setForm(f => ({ ...f, ...p }));
  const selectedCard = cards.find(c => c.id === form.account_id) || null;

  useLayoutEffect(() => navigation.setOptions({ title: id ? 'Editar deuda' : 'Nueva deuda' }), [navigation, id]);
  useEffect(() => {
    if (!id) return;
    debtsRepository.get(db, id).then(d => {
      if (!d) return;
      setForm({ ...d });
      setRateText(d.interest_rate_bp !== null ? String(d.interest_rate_bp / 100) : '');
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
      {!id ? (
        <>
          <AmountField label="Saldo pendiente actual (total financiado que falta)" value={form.balance} onChange={balance => set({ balance })} error={errors.balance} hint="El total que aún debes de esta financiación (no solo el pago del mes), según tu estado de cuenta o app del banco." />
          <DateTimeField label="Fecha de ese saldo" mode="date" value={form.balance_date} onChange={balance_date => set({ balance_date })} />
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
              {form.included === false && Number.isInteger(form.balance) ? ` Quedará en ${formatMoney(Math.max(0, -selectedCard.balance) + form.balance)} (ajuste de saldo, no es un gasto).` : ''}
              {form.included === true ? ' No se modifica la deuda de la tarjeta.' : ''}
            </AppText>
          ) : <View style={{ height: 16 }} />}
        </>
      ) : (
        <AppText variant="caption" color={colors.textSecondary} style={{ marginBottom: 16 }}>Para cambiar el saldo pendiente usa "Actualizar saldo" en el detalle: se guarda como conciliación con historial.</AppText>
      )}
      <AmountField label="Pago mensual (si existe)" value={form.monthly_payment ?? null} onChange={monthly_payment => set({ monthly_payment })} error={errors.monthly_payment} />
      <DateTimeField label="Próximo vencimiento" mode="date" value={form.next_due_date} onChange={next_due_date => set({ next_due_date })} optional onClear={() => set({ next_due_date: null })} error={errors.next_due_date} />
      <TextField label="Día de corte (opcional)" keyboardType="number-pad" value={form.statement_day ? String(form.statement_day) : ''} onChangeText={t => set({ statement_day: onlyInt(t) })} error={errors.statement_day} />
      <TextField label="Cuotas restantes (si las conoces)" keyboardType="number-pad" value={form.installments_remaining !== null && form.installments_remaining !== undefined ? String(form.installments_remaining) : ''} onChangeText={t => set({ installments_remaining: onlyInt(t) })} error={errors.installments_remaining} />
      <TextField label="Tasa de interés anual % (opcional)" keyboardType="decimal-pad" placeholder="Desconocida" value={rateText} onChangeText={setRateText} error={errors.interest_rate_bp} hint="Solo informativa: el recomendador no estima intereses." />
      <TextField label="Notas" value={form.notes || ''} onChangeText={notes => set({ notes })} multiline />
    </Screen>
  );
}
