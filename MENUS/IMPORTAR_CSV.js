/**
 * IMPORTAR_CSV — importación en pasos (archivo → columnas → vista previa →
 * confirmación) y exportación de movimientos.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors, radii, spacing } from '../config/theme';
import { useDb } from '../hooks/DatabaseProvider';
import { useQuery } from '../hooks/useQuery';
import { accountsRepository } from '../database/repositories/accountsRepository';
import { categoriesRepository } from '../database/repositories/categoriesRepository';
import { buildPreview, commitImport, prepareImport, undoImport } from '../services/csv/importService';
import { exportTransactionsCSV } from '../services/csv/exportService';
import { pickTextFile, saveTextFile, PickCancelled } from '../services/files/fileService';
import { KIND_LABELS } from '../services/transactions/rules';
import { addDays, formatDate, todayISO } from '../utils/dates';
import { formatMoney } from '../utils/money';
import AppText from '../components/common/AppText';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import DateTimeField from '../components/common/DateTimeField';
import Icon from '../components/common/Icon';
import Screen from '../components/common/Screen';
import SectionHeader from '../components/common/SectionHeader';
import Segmented from '../components/common/Segmented';
import SelectField from '../components/common/SelectField';
import { useToast } from '../components/common/Toast';

const FIELDS = [
  { key: 'date', label: 'Fecha', required: true },
  { key: 'amount', label: 'Importe (una columna con signo)' },
  { key: 'debit', label: 'Cargo (columna separada)' },
  { key: 'credit', label: 'Abono (columna separada)' },
  { key: 'description', label: 'Descripción' },
  { key: 'type', label: 'Tipo de operación' },
  { key: 'reference', label: 'Referencia / folio' },
  { key: 'category', label: 'Categoría' },
];

export default function IMPORTAR_CSV() {
  const db = useDb();
  const toast = useToast();
  const { data: lookups } = useQuery(async d => ({ accounts: await accountsRepository.list(d), categories: await categoriesRepository.list(d) }), []);
  const [accountId, setAccountId] = useState(null);
  const [file, setFile] = useState(null); // { name, prepared }
  const [mapping, setMapping] = useState({});
  const [dateOrder, setDateOrder] = useState('dmy');
  const [amountSign, setAmountSign] = useState('negativeIsExpense');
  const [defaults, setDefaults] = useState({ expense: null, income: null });
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [lastBatch, setLastBatch] = useState(null);
  const [visible, setVisible] = useState(100);
  const [exportRange, setExportRange] = useState({ from: addDays(todayISO(), -90), to: todayISO() });

  const categoryOptions = useMemo(() => (lookups ? lookups.categories : []).map(c => ({ value: c.id, label: c.name, icon: c.icon, color: c.color, kind: c.kind })), [lookups]);

  const pick = async () => {
    try {
      const f = await pickTextFile();
      const prepared = prepareImport(f.text);
      setFile({ name: f.name, prepared });
      setMapping(prepared.mapping);
      setPreview(null);
      toast(`${prepared.rows.length} filas leídas`);
    } catch (e) {
      if (!(e instanceof PickCancelled)) toast(e.fields ? Object.values(e.fields)[0] : e.message, 'error');
    }
  };

  const makePreview = async () => {
    if (!accountId) return toast('Elige la cuenta de los movimientos', 'error');
    if (mapping.date === undefined) return toast('Indica la columna de fecha', 'error');
    if (mapping.amount === undefined && !(mapping.debit !== undefined && mapping.credit !== undefined)) {
      return toast('Indica la columna de importe o las de cargo/abono', 'error');
    }
    setBusy(true);
    try {
      const m = { ...mapping };
      if (m.debit !== undefined && m.credit !== undefined) delete m.amount;
      setVisible(100);
      setPreview(await buildPreview(db, file.prepared, { accountId, mapping: m, dateOrder, amountSign, defaultCategories: defaults }));
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  // Se identifica la fila por rowIndex (posición real), no por su índice en la lista visible.
  const updateItem = (rowIndex, patch) => setPreview(p => ({ ...p, items: p.items.map(it => (it.rowIndex === rowIndex ? { ...it, ...patch } : it)) }));
  const selected = preview ? preview.items.filter(i => i.valid && i.selected) : [];
  const missingCategory = selected.filter(i => (i.kind === 'expense' || i.kind === 'refund') && !i.category_id).length;

  const confirm = async () => {
    setBusy(true);
    try {
      const res = await commitImport(db, { accountId, items: preview.items, fileName: file.name });
      setLastBatch({ ...res, fileName: file.name });
      setFile(null);
      setPreview(null);
      toast(`${res.imported} movimientos importados`);
    } catch (e) {
      toast(e.fields ? Object.values(e.fields)[0] : e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const doExport = async () => {
    try {
      const { csv, count } = await exportTransactionsCSV(db, { from: exportRange.from, to: addDays(exportRange.to, 1) });
      if (!count) return toast('No hay movimientos en ese rango', 'warning');
      await saveTextFile(`aurea-movimientos-${exportRange.from}_${exportRange.to}.csv`, csv);
      toast(`${count} movimientos exportados`);
    } catch (e) {
      if (!(e instanceof PickCancelled)) toast(e.message, 'error');
    }
  };

  const headerOptions = file ? [{ value: -1, label: '— Ninguna —' }, ...file.prepared.headers.map((h, i) => ({ value: i, label: h || `Columna ${i + 1}`, sublabel: file.prepared.rows[0] ? `Ej.: ${file.prepared.rows[0][i] ?? ''}` : undefined }))] : [];

  return (
    <Screen
      footer={preview ? (
        <View style={styles.footerRow}>
          <Button title="Cancelar" variant="secondary" style={styles.flex} onPress={() => { setPreview(null); setFile(null); }} />
          <Button title={`Importar ${selected.length}`} style={styles.flex2} onPress={confirm} loading={busy} disabled={!selected.length || missingCategory > 0} />
        </View>
      ) : null}>
      {!preview ? (
        <>
          <AppText color={colors.textSecondary} style={styles.intro}>
            Importa el CSV que descargas de tu banca en línea. Nada se guarda hasta que revisas la vista previa y confirmas; si algo falla, no se importa ninguna fila.
          </AppText>
          <SelectField label="Cuenta de los movimientos" value={accountId} onChange={setAccountId} options={(lookups ? lookups.accounts : []).map(a => ({ value: a.id, label: a.name, sublabel: a.type === 'credit' ? 'Crédito: los abonos se toman como devoluciones' : undefined }))} emptyText="Crea primero una cuenta." />
          <Button title={file ? `Archivo: ${file.name}` : 'Elegir archivo CSV'} icon="upload" variant={file ? 'secondary' : 'primary'} onPress={pick} />
          {file ? (
            <>
              <AppText variant="caption" color={colors.textMuted} style={styles.mt}>
                {file.prepared.rows.length} filas · separador "{file.prepared.delimiter === '\t' ? 'tabulador' : file.prepared.delimiter}" · {file.prepared.hasHeader ? 'con encabezados' : 'sin encabezados'}
              </AppText>
              <SectionHeader title="Columnas" />
              {FIELDS.map(f => (
                <SelectField key={f.key} label={f.label} value={mapping[f.key] ?? -1} onChange={v => setMapping(m => { const n = { ...m }; if (v === -1) delete n[f.key]; else n[f.key] = v; return n; })} options={headerOptions} />
              ))}
              <AppText variant="caption" color={colors.textSecondary} style={styles.label}>Formato de fecha</AppText>
              <Segmented options={[{ value: 'dmy', label: 'Día/Mes/Año' }, { value: 'mdy', label: 'Mes/Día/Año' }]} value={dateOrder} onChange={setDateOrder} style={styles.mb} />
              {mapping.amount !== undefined && !(mapping.debit !== undefined && mapping.credit !== undefined) ? (
                <>
                  <AppText variant="caption" color={colors.textSecondary} style={styles.label}>En la columna de importe, los gastos son…</AppText>
                  <Segmented options={[{ value: 'negativeIsExpense', label: 'Negativos (−)' }, { value: 'positiveIsExpense', label: 'Positivos (+)' }]} value={amountSign} onChange={setAmountSign} style={styles.mb} />
                </>
              ) : null}
              <SelectField label="Categoría por defecto para gastos" value={defaults.expense} onChange={v => setDefaults(d => ({ ...d, expense: v }))} options={categoryOptions.filter(c => c.kind !== 'income')} hint="Se usa si no hay categoría en el archivo ni un gasto igual en tu historial." />
              <SelectField label="Categoría por defecto para ingresos (opcional)" value={defaults.income} onChange={v => setDefaults(d => ({ ...d, income: v }))} options={categoryOptions.filter(c => c.kind !== 'expense')} />
              <Button title="Ver vista previa" icon="eye" onPress={makePreview} loading={busy} />
            </>
          ) : null}

          {lastBatch ? (
            <Card style={styles.mtLg}>
              <AppText>Última importación: {lastBatch.imported} movimientos de {lastBatch.fileName}</AppText>
              <Button title="Deshacer esta importación" icon="refund" variant="danger" small style={styles.mt} onPress={async () => { const n = await undoImport(db, lastBatch.batchId); setLastBatch(null); toast(`${n} movimientos eliminados`); }} />
            </Card>
          ) : null}

          <SectionHeader title="Exportar movimientos" />
          <Card>
            <View style={styles.row}>
              <View style={styles.flex}><DateTimeField label="Desde" mode="date" value={exportRange.from} onChange={from => setExportRange(r => ({ ...r, from }))} /></View>
              <View style={styles.flex}><DateTimeField label="Hasta" mode="date" value={exportRange.to} onChange={to => setExportRange(r => ({ ...r, to }))} /></View>
            </View>
            <Button title="Exportar CSV" icon="download" variant="secondary" onPress={doExport} />
            <AppText variant="caption" color={colors.textMuted} style={styles.mt}>
              CSV UTF-8 con columnas id, fecha, tipo, importe, moneda, cuenta, cuenta_destino, categoria, metodo_pago, descripcion, fuente, etiquetas, deuda, origen y referencia. Tú eliges dónde guardarlo.
            </AppText>
          </Card>
        </>
      ) : (
        <>
          <View style={styles.statsRow}>
            <Stat label="Válidas" value={preview.validCount} color={colors.teal} />
            <Stat label="Con error" value={preview.errorCount} color={colors.coral} />
            <Stat label="Posibles duplicados" value={preview.duplicateCount} color={colors.gold} />
          </View>
          <AppText variant="caption" color={colors.textSecondary} style={styles.mb}>
            Marca o desmarca filas. Los duplicados probables vienen desmarcados, pero tú decides: dos compras iguales pueden ser reales.
            {missingCategory ? ` Faltan categorías en ${missingCategory} filas seleccionadas.` : ''}
          </AppText>
          {preview.items.slice(0, visible).map((it, index) => (
            <View key={it.rowIndex} style={[styles.item, !it.valid && styles.itemError]}>
              <Pressable onPress={() => it.valid && updateItem(it.rowIndex, { selected: !it.selected })} style={styles.itemTop} accessibilityRole="checkbox" accessibilityState={{ checked: !!it.selected, disabled: !it.valid }}>
                <View style={[styles.check, it.selected && styles.checkOn]}>{it.selected ? <Icon name="check" size={14} color="#0B1A17" /> : null}</View>
                <View style={styles.flex}>
                  <AppText variant="small" numberOfLines={1}>{it.description || '(sin descripción)'}</AppText>
                  <AppText variant="caption" color={colors.textSecondary}>Fila {it.rowIndex + 1}{it.occurred_at ? ` · ${formatDate(it.occurred_at)}` : ''}{it.kind ? ` · ${KIND_LABELS[it.kind]}` : ''}</AppText>
                </View>
                {it.amount ? <AppText variant="small" color={it.kind === 'expense' ? colors.text : colors.positive}>{it.kind === 'expense' ? '-' : '+'}{formatMoney(it.amount)}</AppText> : null}
              </Pressable>
              {it.errors.map(e => <AppText key={e} variant="caption" color={colors.coral}>{e}</AppText>)}
              {it.duplicates.map((d, i) => <AppText key={i} variant="caption" color={colors.gold}>⚠ {d.reason}{d.occurred_at ? ` (${formatDate(d.occurred_at)})` : ''}</AppText>)}
              {it.valid && it.kind !== 'income' ? (
                <SelectField value={it.category_id} onChange={v => updateItem(it.rowIndex, { category_id: v })} options={categoryOptions.filter(c => c.kind !== 'income')} placeholder="Elegir categoría" error={it.selected && !it.category_id ? 'Falta categoría' : null} />
              ) : null}
            </View>
          ))}
          {preview.items.length > visible ? (
            <Button title={`Mostrar ${Math.min(100, preview.items.length - visible)} filas más (de ${preview.items.length - visible})`} variant="ghost" onPress={() => setVisible(v => v + 100)} />
          ) : null}
        </>
      )}
    </Screen>
  );
}

function Stat({ label, value, color }) {
  return (
    <View style={styles.stat}>
      <AppText variant="amount" color={color}>{value}</AppText>
      <AppText variant="caption" color={colors.textSecondary}>{label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  intro: { marginBottom: spacing.lg, lineHeight: 21 },
  mt: { marginTop: spacing.sm },
  mtLg: { marginTop: spacing.lg },
  mb: { marginBottom: spacing.lg },
  label: { marginBottom: 8 },
  row: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
  flex2: { flex: 2 },
  footerRow: { flexDirection: 'row', gap: spacing.md },
  statsRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  stat: { flex: 1, backgroundColor: colors.surface, borderRadius: radii.md, padding: spacing.md, alignItems: 'center' },
  item: { backgroundColor: colors.surface, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  itemError: { borderColor: colors.coral, opacity: 0.85 },
  itemTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: 4, minHeight: 44 },
  check: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: colors.teal, borderColor: colors.teal },
});
