import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, spacing } from '../config/theme';
import { useDb } from '../hooks/DatabaseProvider';
import { useQuery } from '../hooks/useQuery';
import { useSubmit } from '../hooks/useSubmit';
import { accountsRepository } from '../database/repositories/accountsRepository';
import { goalsRepository } from '../database/repositories/goalsRepository';
import { createGoal, updateGoal } from '../services/goals/goalService';
import AppText from '../components/common/AppText';
import AmountField from '../components/common/AmountField';
import Button from '../components/common/Button';
import DateTimeField from '../components/common/DateTimeField';
import Screen from '../components/common/Screen';
import Segmented from '../components/common/Segmented';
import SelectField from '../components/common/SelectField';
import TextField from '../components/common/TextField';

const EMPTY = { name: '', target_amount: null, deadline: null, mode: 'virtual', account_id: null, notes: '' };

export default function META_FORM({ navigation, route }) {
  const db = useDb();
  const id = route.params && route.params.id;
  const [form, setForm] = useState(EMPTY);
  const [loaded, setLoaded] = useState(!id);
  const { data: accounts = [] } = useQuery(d => accountsRepository.list(d), []);
  const { submit, saving, errors } = useSubmit();

  useEffect(() => {
    if (!id) return;
    goalsRepository.get(db, id).then(goal => {
      if (goal) setForm({ ...EMPTY, ...goal });
      setLoaded(true);
    });
  }, [db, id]);

  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const accountOptions = accounts.filter(a => a.type !== 'credit').map(a => ({
    value: a.id,
    label: a.name,
    sublabel: a.type === 'savings' ? 'Ahorro' : a.type,
    color: a.color,
  }));
  const save = () => submit(
    () => id ? updateGoal(db, id, form) : createGoal(db, form),
    { success: id ? 'Meta actualizada' : 'Meta creada', onDone: () => navigation.goBack() },
  );

  if (!loaded) return <Screen />;
  return (
    <Screen footer={<View style={styles.footer}><Button title={id ? 'Guardar cambios' : 'Guardar meta'} onPress={save} loading={saving} style={styles.save} /></View>}>
      <TextField label="Nombre de la meta" value={form.name} onChangeText={value => set('name', value)} error={errors.name} placeholder="Ej. Fondo de emergencia" />
      <AmountField label="Importe objetivo" value={form.target_amount} onChange={value => set('target_amount', value)} error={errors.target_amount} large />
      <DateTimeField label="Fecha límite (opcional)" mode="date" optional value={form.deadline} onChange={value => set('deadline', value)} onClear={() => set('deadline', null)} />
      <AppText variant="caption" color={colors.textSecondary} style={styles.label}>Cómo apartar el dinero</AppText>
      <Segmented
        options={[{ value: 'virtual', label: 'Reserva virtual' }, { value: 'account', label: 'Cuenta de ahorro' }]}
        value={form.mode}
        onChange={value => setForm(current => ({ ...current, mode: value, account_id: value === 'account' ? current.account_id : null }))}
      />
      <AppText variant="caption" color={colors.textMuted} style={styles.hint}>
        {form.mode === 'virtual'
          ? 'El dinero sigue en tu cuenta; aquí solo queda marcado como apartado.'
          : 'Cada aportación moverá el dinero a la cuenta elegida mediante una transferencia, no como gasto.'}
      </AppText>
      {form.mode === 'account' ? (
        <SelectField
          label="Cuenta de ahorro"
          value={form.account_id}
          options={accountOptions}
          onChange={value => set('account_id', value)}
          error={errors.account_id}
          placeholder="Selecciona una cuenta"
          emptyText="Crea primero una cuenta que no sea de crédito."
        />
      ) : null}
      <TextField label="Notas (opcional)" value={form.notes || ''} onChangeText={value => set('notes', value)} multiline placeholder="Detalles de esta meta" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  footer: { flexDirection: 'row' },
  save: { flex: 1 },
  label: { marginBottom: spacing.sm },
  hint: { marginTop: spacing.sm, marginBottom: spacing.lg, lineHeight: 18 },
});
