import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, radii, spacing } from '../config/theme';
import { CATEGORY_COLORS } from '../config/categories';
import { CATEGORY_ICON_CHOICES } from '../components/common/Icon';
import { useDb } from '../hooks/DatabaseProvider';
import { useQuery } from '../hooks/useQuery';
import { useSubmit } from '../hooks/useSubmit';
import { categoriesRepository } from '../database/repositories/categoriesRepository';
import { archiveCategory, createCategory, deleteCategory, getCategoryUsage, suggestColor, updateCategory } from '../services/categories/categoryService';
import AppText from '../components/common/AppText';
import Button from '../components/common/Button';
import CategoryIcon from '../components/CategoryIcon';
import ConfirmSheet from '../components/common/ConfirmSheet';
import Icon from '../components/common/Icon';
import Screen from '../components/common/Screen';
import Segmented from '../components/common/Segmented';
import SelectField from '../components/common/SelectField';
import Sheet from '../components/common/Sheet';
import TextField from '../components/common/TextField';

const EMPTY = { name: '', kind: 'expense', color: CATEGORY_COLORS[0], icon: 'dots', status: 'active' };
const KINDS = [{ value: 'expense', label: 'Gasto' }, { value: 'income', label: 'Ingreso' }, { value: 'both', label: 'Ambos' }];

export default function CATEGORIA_FORM({ navigation, route }) {
  const db = useDb();
  const id = route.params && route.params.id;
  const [form, setForm] = useState(EMPTY);
  const [loaded, setLoaded] = useState(!id);
  const [deleteSheet, setDeleteSheet] = useState(false);
  const [usage, setUsage] = useState(null);
  const [reassignTo, setReassignTo] = useState('');
  const { data: allCategories = [] } = useQuery(d => categoriesRepository.list(d, { includeArchived: true }), []);
  const { submit, saving, errors } = useSubmit();

  useEffect(() => {
    if (!id) {
      suggestColor(db).then(color => setForm(current => ({ ...current, color })));
      return;
    }
    categoriesRepository.get(db, id).then(category => {
      if (category) setForm({ ...EMPTY, ...category });
      setLoaded(true);
    });
  }, [db, id]);

  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const compatible = allCategories.filter(c => c.id !== id && c.status === 'active' && (form.kind === 'both' || c.kind === 'both' || c.kind === form.kind));
  const save = () => submit(
    () => id ? updateCategory(db, id, form) : createCategory(db, form),
    { success: id ? 'Categoría actualizada' : 'Categoría creada', onDone: () => navigation.goBack() },
  );
  const toggleArchive = () => submit(
    () => archiveCategory(db, id, form.status !== 'archived'),
    { success: form.status === 'archived' ? 'Categoría restaurada' : 'Categoría archivada', onDone: () => navigation.goBack() },
  );
  const askDelete = async () => {
    const result = await getCategoryUsage(db, id);
    setUsage(result);
    setReassignTo('');
    setDeleteSheet(true);
  };
  const doDelete = () => submit(
    () => deleteCategory(db, id, usage && (usage.transactions > 0 || usage.recurring > 0) ? { reassignTo } : {}),
    { success: 'Categoría eliminada', onDone: () => { setDeleteSheet(false); navigation.goBack(); } },
  );

  if (!loaded) return <Screen />;
  const hasUsage = usage && (usage.transactions > 0 || usage.recurring > 0);
  return (
    <Screen footer={<Button title={id ? 'Guardar cambios' : 'Guardar categoría'} onPress={save} loading={saving} />}>
      <TextField label="Nombre" value={form.name} onChangeText={value => set('name', value)} error={errors.name} placeholder="Ej. Alimentación" />
      <AppText variant="caption" color={colors.textSecondary} style={styles.label}>Tipo</AppText>
      <Segmented options={KINDS} value={form.kind} onChange={value => set('kind', value)} style={styles.control} />
      <AppText variant="caption" color={colors.textSecondary} style={styles.label}>Color</AppText>
      <View style={styles.grid}>
        {CATEGORY_COLORS.map(color => (
          <Pressable key={color} onPress={() => set('color', color)} accessibilityRole="button" accessibilityLabel={`Color ${color}`} accessibilityState={{ selected: form.color === color }} style={[styles.color, { backgroundColor: color }, form.color === color && styles.selectedColor]}>
            {form.color === color ? <Icon name="check" size={18} color={colors.bg} /> : null}
          </Pressable>
        ))}
      </View>
      <AppText variant="caption" color={colors.textSecondary} style={styles.label}>Icono</AppText>
      <View style={styles.iconGrid}>
        {CATEGORY_ICON_CHOICES.map(icon => (
          <Pressable key={icon} onPress={() => set('icon', icon)} style={[styles.iconChoice, form.icon === icon && styles.selectedIcon]} accessibilityRole="button" accessibilityLabel={`Icono ${icon}`} accessibilityState={{ selected: form.icon === icon }}>
            <Icon name={icon} size={22} color={form.icon === icon ? colors.teal : colors.textSecondary} />
          </Pressable>
        ))}
      </View>
      <CardPreview form={form} />
      {id ? (
        <View style={styles.actions}>
          <Button title={form.status === 'archived' ? 'Restaurar categoría' : 'Archivar categoría'} variant="secondary" onPress={toggleArchive} loading={saving} style={styles.action} />
          <Button title="Eliminar" variant="danger" onPress={askDelete} disabled={saving} style={styles.action} />
        </View>
      ) : null}
      <Sheet visible={deleteSheet && !!hasUsage} onClose={() => setDeleteSheet(false)} title="Antes de eliminar" scroll>
        <AppText color={colors.textSecondary} style={styles.sheetText}>
          Esta categoría tiene {usage ? usage.transactions : 0} movimientos y {usage ? usage.recurring : 0} recurrencias. Elige una categoría compatible para conservar ese historial.
        </AppText>
        <SelectField label="Mover movimientos y recurrencias a" value={reassignTo} options={compatible.map(c => ({ value: c.id, label: c.name, sublabel: { expense: 'Gasto', income: 'Ingreso', both: 'Ambos' }[c.kind], icon: c.icon, color: c.color }))} onChange={setReassignTo} placeholder="Selecciona una categoría" emptyText="No hay categorías compatibles." />
        <Button title="Eliminar y reasignar" onPress={doDelete} loading={saving} disabled={!reassignTo} />
      </Sheet>
      <ConfirmSheet
        visible={deleteSheet && !!usage && !hasUsage}
        title="Eliminar categoría"
        message="Esta categoría no tiene movimientos ni recurrencias. Se eliminará definitivamente; los presupuestos asociados también desaparecerán."
        confirmLabel="Eliminar"
        danger
        onCancel={() => setDeleteSheet(false)}
        onConfirm={doDelete}
        loading={saving}
      />
      {id ? <AppText variant="caption" color={colors.textMuted} style={styles.note}>Archivar conserva el historial y el color de la categoría en los gráficos.</AppText> : null}
    </Screen>
  );
}

function CardPreview({ form }) {
  return <View style={styles.preview}><AppText variant="caption" color={colors.textSecondary}>Vista previa</AppText><View style={styles.previewRow}><CategoryIcon icon={form.icon} color={form.color} /><AppText variant="subtitle">{form.name || 'Nueva categoría'}</AppText></View></View>;
}

const styles = StyleSheet.create({
  label: { marginBottom: spacing.sm },
  control: { marginBottom: spacing.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.lg },
  color: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  selectedColor: { borderWidth: 3, borderColor: colors.text },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  iconChoice: { width: 44, height: 44, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  selectedIcon: { borderColor: colors.teal, backgroundColor: colors.tealSoft },
  preview: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.lg, marginBottom: spacing.lg },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md },
  actions: { gap: spacing.md, marginTop: spacing.sm },
  action: { width: '100%' },
  sheetText: { lineHeight: 21, marginBottom: spacing.lg },
  note: { textAlign: 'center', marginTop: spacing.lg, lineHeight: 18 },
});
