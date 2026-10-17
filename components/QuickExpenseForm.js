/**
 * Formulario de movimientos. Optimizado para registrar un gasto en segundos:
 * importe grande con foco, categorías en rejilla, método de pago que filtra
 * las cuentas compatibles y fecha/hora actuales por defecto.
 * También sirve para ingresos, transferencias, pagos de tarjeta y devoluciones.
 */
import React, { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { colors, radii, spacing } from '../config/theme';
import { useQuery } from '../hooks/useQuery';
import { accountsRepository } from '../database/repositories/accountsRepository';
import { categoriesRepository } from '../database/repositories/categoriesRepository';
import { debtsRepository } from '../database/repositories/debtsRepository';
import { ACCOUNT_TYPES_FOR_METHOD, INCOME_TYPE_LABELS, KIND_LABELS, PAYMENT_METHOD_LABELS, defaultMethodForAccount } from '../services/transactions/rules';
import { FINANCING_LABELS } from '../services/debts/debtService';
import { formatMoney } from '../utils/money';
import { formatDate } from '../utils/dates';
import AmountField from './common/AmountField';
import AppText from './common/AppText';
import DateTimeField from './common/DateTimeField';
import Segmented from './common/Segmented';
import SelectField from './common/SelectField';
import TextField from './common/TextField';
import CategoryIcon from './CategoryIcon';

export const FORM_KINDS = [
  { value: 'expense', label: 'Gasto' },
  { value: 'income', label: 'Ingreso' },
  { value: 'transfer', label: 'Transferir' },
  { value: 'card_payment', label: 'Pagar tarjeta' },
  { value: 'refund', label: 'Devolución' },
];

const METHODS = ['cash', 'debit', 'credit', 'other'];

async function loadOptions(db) {
  const [accounts, categories, debts, recentExpenses] = await Promise.all([
    accountsRepository.list(db),
    categoriesRepository.list(db),
    debtsRepository.list(db),
    db.all(
      `SELECT t.id, t.amount, t.description, t.occurred_at, t.category_id, t.account_id, c.name AS category_name
       FROM transactions t JOIN categories c ON c.id = t.category_id
       WHERE t.kind = 'expense' ORDER BY t.occurred_at DESC LIMIT 60`,
    ),
  ]);
  return { accounts, categories, debts, recentExpenses };
}

/**
 * value/onChange: estado del formulario controlado por la pantalla.
 * errors: errores por campo (ValidationError.fields).
 */
export default function QuickExpenseForm({ value, onChange, errors = {}, editing, lockKind }) {
  const { data } = useQuery(loadOptions, []);
  const set = patch => onChange({ ...value, ...patch });
  const accounts = useMemo(() => (data ? data.accounts : []), [data]);
  const kind = value.kind;

  const categories = useMemo(() => {
    if (!data) return [];
    const wanted = kind === 'income' ? 'income' : 'expense';
    return data.categories.filter(c => c.kind === wanted || c.kind === 'both' || c.id === value.category_id);
  }, [data, kind, value.category_id]);

  const sourceAccounts = useMemo(() => {
    switch (kind) {
      case 'expense':
        return value.payment_method && value.payment_method !== 'other'
          ? accounts.filter(a => ACCOUNT_TYPES_FOR_METHOD[value.payment_method].includes(a.type))
          : accounts;
      case 'income':
      case 'card_payment':
        return accounts.filter(a => a.type !== 'credit');
      default:
        return accounts;
    }
  }, [accounts, kind, value.payment_method]);

  const targetAccounts = useMemo(() => {
    if (kind === 'card_payment') return accounts.filter(a => a.type === 'credit');
    if (kind === 'transfer') return accounts.filter(a => a.type !== 'credit' && a.id !== value.account_id);
    return [];
  }, [accounts, kind, value.account_id]);

  // Selección automática cuando solo hay una cuenta compatible.
  useEffect(() => {
    if (!data) return;
    if (sourceAccounts.length === 1 && value.account_id !== sourceAccounts[0].id && !sourceAccounts.some(a => a.id === value.account_id)) {
      set({ account_id: sourceAccounts[0].id });
    } else if (value.account_id && !sourceAccounts.some(a => a.id === value.account_id) && !editing) {
      set({ account_id: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceAccounts, data]);

  // Movimiento con fecha anterior al saldo inicial de la cuenta (ya incluido en ese saldo).
  const beforeOpening = useMemo(() => {
    const acc = accounts.find(a => a.id === value.account_id);
    return acc && value.occurred_at && value.occurred_at.slice(0, 10) < acc.initial_balance_date ? acc : null;
  }, [accounts, value.account_id, value.occurred_at]);

  const debtsForCard = useMemo(
    () => (data && kind === 'card_payment' ? data.debts.filter(d => d.account_id === value.to_account_id) : []),
    [data, kind, value.to_account_id],
  );
  const refundable = useMemo(
    () => (data && kind === 'refund' ? data.recentExpenses.filter(e => !value.category_id || e.category_id === value.category_id) : []),
    [data, kind, value.category_id],
  );

  const accountOption = a => ({
    value: a.id,
    label: a.name,
    sublabel: a.type === 'credit' ? `Deuda ${formatMoney(Math.max(0, -a.balance), a.currency)}` : `Saldo ${formatMoney(a.balance, a.currency)}`,
    icon: a.type === 'credit' ? 'card' : a.type === 'cash' ? 'cash' : a.type === 'savings' ? 'piggy' : 'wallet',
    color: a.type === 'credit' ? colors.coral : colors.teal,
  });

  return (
    <View>
      {!lockKind ? (
        <Segmented
          options={FORM_KINDS.map(k => ({ value: k.value, label: k.label }))}
          value={kind}
          onChange={k => set({ kind: k, category_id: null, to_account_id: null, debt_id: null, related_transaction_id: null, financed: false })}
          style={styles.kinds}
        />
      ) : null}

      <AmountField label={kind === 'refund' ? 'Importe devuelto' : 'Importe'} value={value.amount} onChange={amount => set({ amount })} error={errors.amount} large autoFocus={!editing} />

      {kind === 'expense' || kind === 'refund' || kind === 'income' ? (
        <View style={styles.block}>
          <AppText variant="caption" color={errors.category_id ? colors.coral : colors.textSecondary} style={styles.label}>
            {kind === 'income' ? 'Categoría (opcional)' : 'Categoría'}{errors.category_id ? ` · ${errors.category_id}` : ''}
          </AppText>
          <View style={styles.catGrid}>
            {categories.map(c => {
              const active = c.id === value.category_id;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => set({ category_id: active && kind === 'income' ? null : c.id, related_transaction_id: null })}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={c.name}
                  style={[styles.cat, active && { borderColor: c.color, backgroundColor: c.color + '18' }]}>
                  <CategoryIcon icon={c.icon} color={c.color} size={34} />
                  <AppText variant="caption" numberOfLines={1} color={active ? colors.text : colors.textSecondary} style={styles.catName}>{c.name}</AppText>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {kind === 'expense' ? (
        <View style={styles.block}>
          <AppText variant="caption" color={colors.textSecondary} style={styles.label}>Método de pago</AppText>
          <Segmented options={METHODS.map(m => ({ value: m, label: PAYMENT_METHOD_LABELS[m] }))} value={value.payment_method} onChange={m => set({ payment_method: m, financed: m === 'credit' ? value.financed : false })} />
        </View>
      ) : null}

      {kind === 'income' ? (
        <>
          <TextField label="Fuente del ingreso" placeholder="Empresa, cliente, persona…" value={value.source || ''} onChangeText={source => set({ source })} />
          <View style={styles.block}>
            <AppText variant="caption" color={colors.textSecondary} style={styles.label}>Tipo de ingreso</AppText>
            <Segmented options={['salary', 'extra', 'other'].map(t => ({ value: t, label: INCOME_TYPE_LABELS[t].replace(' extraordinario', ' extra') }))} value={value.income_type || 'salary'} onChange={income_type => set({ income_type })} />
            <AppText variant="caption" color={colors.textMuted} style={styles.hint}>¿Es una devolución de una compra? Usa la pestaña "Devolución" para no inflar tus ingresos.</AppText>
          </View>
        </>
      ) : null}

      <SelectField
        label={kind === 'income' ? 'Cuenta receptora' : kind === 'transfer' || kind === 'card_payment' ? 'Desde la cuenta' : kind === 'refund' ? 'Cuenta donde se devolvió' : value.payment_method === 'credit' ? 'Tarjeta o cuenta de crédito' : 'Cuenta de origen'}
        value={value.account_id}
        onChange={account_id => {
          const acc = accounts.find(a => a.id === account_id);
          set({ account_id, ...(kind === 'expense' && !value.payment_method && acc ? { payment_method: defaultMethodForAccount(acc.type) } : {}) });
        }}
        options={sourceAccounts.map(accountOption)}
        error={errors.account_id}
        emptyText={kind === 'expense' && value.payment_method ? `No tienes cuentas de tipo ${PAYMENT_METHOD_LABELS[value.payment_method].toLowerCase()}. Créala en Cuentas.` : 'Primero crea una cuenta en Cuentas.'}
      />

      {kind === 'transfer' || kind === 'card_payment' ? (
        <SelectField
          label={kind === 'card_payment' ? 'Tarjeta que pagas' : 'Hacia la cuenta'}
          value={value.to_account_id}
          onChange={to_account_id => set({ to_account_id, debt_id: null })}
          options={targetAccounts.map(accountOption)}
          error={errors.to_account_id}
          emptyText={kind === 'card_payment' ? 'No tienes tarjetas o cuentas de crédito.' : 'No hay otra cuenta disponible.'}
        />
      ) : null}

      {kind === 'card_payment' && debtsForCard.length ? (
        <SelectField
          label="Aplicar a una financiación (opcional)"
          value={value.debt_id || ''}
          onChange={debt_id => set({ debt_id: debt_id || null })}
          options={[{ value: '', label: 'Pago general de la tarjeta' }, ...debtsForCard.map(d => ({ value: d.id, label: d.name, sublabel: `Pendiente ${formatMoney(Math.max(0, d.outstanding))}` }))]}
          error={errors.debt_id}
          hint="Reduce la deuda de esta tarjeta y, si eliges una financiación, también su saldo pendiente."
        />
      ) : null}

      {kind === 'refund' ? (
        <SelectField
          label="Gasto original (opcional)"
          value={value.related_transaction_id || ''}
          onChange={id => {
            const e = refundable.find(x => x.id === id);
            set({ related_transaction_id: id || null, ...(e ? { category_id: e.category_id } : {}) });
          }}
          options={[{ value: '', label: 'Sin vincular' }, ...refundable.map(e => ({ value: e.id, label: e.description || e.category_name, sublabel: `${formatMoney(e.amount)} · ${formatDate(e.occurred_at)}` }))]}
          error={errors.related_transaction_id}
          hint="La devolución reduce el gasto neto de su categoría; no cuenta como ingreso."
        />
      ) : null}

      <DateTimeField label="Fecha y hora" value={value.occurred_at} onChange={occurred_at => set({ occurred_at })} error={errors.occurred_at} />
      {beforeOpening ? (
        <AppText variant="caption" color={colors.gold} style={styles.dateNote}>
          Esta fecha es anterior al saldo inicial de {beforeOpening.name} ({formatDate(beforeOpening.initial_balance_date)}): contará en el gasto de ese periodo, pero no cambiará el saldo de la cuenta porque ya estaba incluido en él.
        </AppText>
      ) : null}
      <TextField label="Descripción (opcional)" placeholder="¿En qué fue?" value={value.description || ''} onChangeText={description => set({ description })} maxLength={140} />

      {kind === 'expense' ? (
        <TextField label="Etiquetas (opcional)" placeholder="viaje, trabajo…" value={value.tags || ''} onChangeText={tags => set({ tags })} maxLength={80} />
      ) : null}

      {kind === 'expense' && value.payment_method === 'credit' && !editing ? (
        <Animated.View layout={LinearTransition} style={styles.financeBox}>
          <View style={styles.switchRow}>
            <View style={styles.flex}>
              <AppText>Compra financiada</AppText>
              <AppText variant="caption" color={colors.textSecondary}>Meses sin intereses o cuotas. Crea su plan de pago; el gasto se cuenta una sola vez.</AppText>
            </View>
            <Switch value={!!value.financed} onValueChange={financed => set({ financed })} trackColor={{ true: colors.teal, false: colors.border }} thumbColor={colors.text} accessibilityLabel="Compra financiada" />
          </View>
          {value.financed ? (
            <Animated.View entering={FadeIn} exiting={FadeOut}>
              <TextField label="Nombre del plan" placeholder="Ej. Laptop a 12 MSI" value={value.debt_name || ''} onChangeText={debt_name => set({ debt_name })} error={errors.name} />
              <SelectField label="Tipo" value={value.financing_type || 'msi'} onChange={financing_type => set({ financing_type })} options={Object.entries(FINANCING_LABELS).map(([v, l]) => ({ value: v, label: l }))} />
              <AmountField label="Pago mensual (opcional)" value={value.monthly_payment ?? null} onChange={monthly_payment => set({ monthly_payment })} />
              <TextField label="Cuotas restantes (opcional)" keyboardType="number-pad" value={value.installments_remaining ? String(value.installments_remaining) : ''} onChangeText={t => set({ installments_remaining: t.replace(/\D/g, '') ? Number(t.replace(/\D/g, '')) : null })} />
              <DateTimeField label="Próximo vencimiento (opcional)" mode="date" value={value.next_due_date || null} onChange={next_due_date => set({ next_due_date })} optional onClear={() => set({ next_due_date: null })} />
            </Animated.View>
          ) : null}
        </Animated.View>
      ) : null}
      {editing ? <AppText variant="caption" color={colors.textMuted}>Tipo: {KIND_LABELS[kind]}</AppText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  kinds: { marginBottom: spacing.lg },
  block: { marginBottom: spacing.lg },
  label: { marginBottom: 8 },
  hint: { marginTop: 6 },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  cat: { width: '25%', alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radii.md, borderWidth: 1, borderColor: 'transparent' },
  catName: { marginTop: 4, maxWidth: '92%' },
  dateNote: { marginTop: -8, marginBottom: spacing.lg },
  financeBox: { backgroundColor: colors.surface, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  switchRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  flex: { flex: 1, marginRight: spacing.md },
});
