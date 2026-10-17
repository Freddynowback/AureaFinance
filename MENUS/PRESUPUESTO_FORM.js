import React, { useEffect, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { colors, spacing } from '../config/theme';
import { useDb } from '../hooks/DatabaseProvider';
import { useQuery } from '../hooks/useQuery';
import { useSettings } from '../hooks/useSettings';
import { useSubmit } from '../hooks/useSubmit';
import { categoriesRepository } from '../database/repositories/categoriesRepository';
import { budgetsRepository } from '../database/repositories/budgetsRepository';
import { budgetHistory, createBudget, deleteBudget, updateBudget } from '../services/budgets/budgetService';
import { describePeriod } from '../utils/periods';
import AppText from '../components/common/AppText';
import AmountField from '../components/common/AmountField';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import ConfirmSheet from '../components/common/ConfirmSheet';
import Screen from '../components/common/Screen';
import SelectField from '../components/common/SelectField';
import Segmented from '../components/common/Segmented';
import TextField from '../components/common/TextField';
import ProgressBar from '../components/common/ProgressBar';

const EMPTY = { category_id: '', period_type: 'monthly', amount: null, thresholds: '50,80,100', active: 1 };

export default function PRESUPUESTO_FORM({ navigation, route }) {
  const db = useDb();
  const id = route.params && route.params.id;
  const { periodSettings } = useSettings();
  const [form, setForm] = useState(EMPTY);
  const [loaded, setLoaded] = useState(!id);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { data: categories = [] } = useQuery(d => categoriesRepository.list(d, { kind: 'expense' }), []);
  const { data: historyData } = useQuery(d => id ? budgetsRepository.get(d, id).then(budget => budget ? budgetHistory(d, budget, periodSettings, 6).then(history => ({ budget, history })) : null) : Promise.resolve(null), [id, periodSettings]);
  const { submit, saving, errors } = useSubmit();

  useEffect(() => {
    if (!id) return;
    budgetsRepository.get(db, id).then(budget => {
      if (budget) setForm({ ...EMPTY, ...budget, category_id: budget.category_id || '', active: !!budget.active });
      setLoaded(true);
    });
  }, [db, id]);

  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const save = () => submit(
    () => id ? updateBudget(db, id, form) : createBudget(db, form),
    { success: id ? 'Presupuesto actualizado' : 'Presupuesto creado', onDone: () => navigation.goBack() },
  );
  const remove = () => submit(
    () => deleteBudget(db, id),
    { success: 'Presupuesto eliminado', onDone: () => { setConfirmDelete(false); navigation.goBack(); } },
  );
  if (!loaded) return <Screen />;
  const categoryOptions = [{ value: '', label: 'General (todas las categorías)', icon: 'chart', color: colors.teal }].concat(categories.map(c => ({ value: c.id, label: c.name, icon: c.icon, color: c.color })));
  return (
    <Screen footer={<Button title={id ? 'Guardar cambios' : 'Guardar presupuesto'} onPress={save} loading={saving} />}>
      <SelectField label="Categoría" value={form.category_id} options={categoryOptions} onChange={value => set('category_id', value)} error={errors.category_id} />
      <AppText variant="caption" color={colors.textSecondary} style={styles.label}>Periodo</AppText>
      <Segmented options={[{ value: 'weekly', label: 'Semanal' }, { value: 'biweekly', label: 'Quincenal' }, { value: 'monthly', label: 'Mensual' }]} value={form.period_type} onChange={value => set('period_type', value)} style={styles.control} />
      <AmountField label="Límite" value={form.amount} onChange={value => set('amount', value)} error={errors.amount} large />
      <TextField label="Umbrales de alerta" value={form.thresholds || ''} onChangeText={value => set('thresholds', value)} error={errors.thresholds} hint="Porcentaje separados por comas, por ejemplo: 50,80,100" keyboardType="numbers-and-punctuation" />
      <View style={styles.switchRow}><View style={styles.flex}><AppText variant="subtitle">Presupuesto activo</AppText><AppText variant="caption" color={colors.textSecondary}>Recibirás sus avisos mientras esté activo.</AppText></View><Switch value={!!form.active} onValueChange={value => set('active', value)} trackColor={{ true: colors.teal, false: colors.border }} thumbColor={colors.text} /></View>
      {id && historyData ? <History history={historyData.history} /> : null}
      <AppText variant="caption" color={colors.textMuted} style={styles.note}>Superar este presupuesto no bloquea registrar gastos.</AppText>
      {id ? <Button title="Eliminar presupuesto" variant="danger" onPress={() => setConfirmDelete(true)} disabled={saving} style={styles.delete} /> : null}
      <ConfirmSheet visible={confirmDelete} title="Eliminar presupuesto" message="Se eliminará este límite y su configuración de alertas. Tus movimientos no cambiarán." confirmLabel="Eliminar" danger onCancel={() => setConfirmDelete(false)} onConfirm={remove} loading={saving} />
    </Screen>
  );
}

function History({ history }) {
  return <View style={styles.history}><AppText variant="subtitle">Historial (6 periodos)</AppText>{history.map(item => <Card key={`${item.period.start}-${item.period.end}`} style={styles.historyCard} animate={false}><View style={styles.historyTop}><AppText variant="caption" color={colors.textSecondary}>{describePeriod(item.period)}</AppText><AppText variant="caption" color={item.exceeded ? colors.coral : colors.textSecondary}>{item.percent}%</AppText></View><ProgressBar value={item.percent / 100} color={item.exceeded ? colors.coral : colors.teal} /></Card>)}</View>;
}

const styles = StyleSheet.create({
  label: { marginBottom: spacing.sm },
  control: { marginBottom: spacing.lg },
  switchRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
  flex: { flex: 1 },
  history: { marginTop: spacing.sm, marginBottom: spacing.lg },
  historyCard: { marginTop: spacing.sm, padding: spacing.md },
  historyTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  note: { textAlign: 'center', marginBottom: spacing.lg, lineHeight: 18 },
  delete: { marginTop: spacing.md },
});
