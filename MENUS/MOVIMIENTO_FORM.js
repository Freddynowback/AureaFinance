/**
 * MOVIMIENTO_FORM — alta y edición de movimientos.
 */
import React, { useEffect, useLayoutEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, spacing } from '../config/theme';
import { useDb } from '../hooks/DatabaseProvider';
import { useSettings } from '../hooks/useSettings';
import { useSubmit } from '../hooks/useSubmit';
import { transactionsRepository } from '../database/repositories/transactionsRepository';
import { accountsRepository } from '../database/repositories/accountsRepository';
import { checkCreditCharge, creditSummary } from '../services/accounts/creditService';
import { createTransaction, updateTransaction } from '../services/transactions/transactionService';
import { createFinancedPurchase } from '../services/debts/debtService';
import { previewBudgetImpact } from '../services/budgets/budgetService';
import { checkImmediateAlerts, notifySafely, refreshScheduledNotifications } from '../services/notifications/notificationService';
import { useToast } from '../components/common/Toast';
import { KIND_LABELS } from '../services/transactions/rules';
import { nowDateTime } from '../utils/dates';
import { formatMoney } from '../utils/money';
import Button from '../components/common/Button';
import ConfirmSheet from '../components/common/ConfirmSheet';
import Screen from '../components/common/Screen';
import QuickExpenseForm from '../components/QuickExpenseForm';
import AppText from '../components/common/AppText';

const EMPTY = {
  kind: 'expense',
  amount: null,
  category_id: null,
  account_id: null,
  to_account_id: null,
  payment_method: null,
  occurred_at: null,
  description: '',
  tags: '',
  source: '',
  income_type: 'salary',
  debt_id: null,
  related_transaction_id: null,
  financed: false,
};

export default function MOVIMIENTO_FORM({ navigation, route }) {
  const db = useDb();
  const { periodSettings } = useSettings();
  const params = route.params || {};
  const editingId = params.id || null;
  const [form, setForm] = useState({ ...EMPTY, kind: params.kind || 'expense', occurred_at: nowDateTime(), ...(params.prefill || {}) });
  const [loaded, setLoaded] = useState(!editingId);
  const [budgetWarning, setBudgetWarning] = useState(null);
  const { submit, saving, errors } = useSubmit();
  const toast = useToast();

  useLayoutEffect(() => {
    navigation.setOptions({ title: editingId ? `Editar ${KIND_LABELS[form.kind].toLowerCase()}` : 'Nuevo movimiento' });
  }, [navigation, editingId, form.kind]);

  useEffect(() => {
    if (!editingId) return;
    transactionsRepository.get(db, editingId).then(t => {
      if (t) setForm({ ...EMPTY, ...t, financed: false });
      setLoaded(true);
    });
  }, [db, editingId]);

  const persist = () =>
    submit(
      async () => {
        const input = { ...form, amount: form.amount };
        delete input.financed;
        if (editingId) return updateTransaction(db, editingId, input);
        if (form.kind === 'expense' && form.financed) {
          return createFinancedPurchase(db, input, {
            name: form.debt_name || form.description || 'Compra financiada',
            financing_type: form.financing_type || 'msi',
            monthly_payment: form.monthly_payment || null,
            installments_remaining: form.installments_remaining || null,
            next_due_date: form.next_due_date || null,
          });
        }
        return createTransaction(db, input);
      },
      {
        success: editingId ? 'Movimiento actualizado' : `${KIND_LABELS[form.kind]} guardado`,
        onDone: () => {
          notifySafely(checkImmediateAlerts(db), toast);
          if (form.kind === 'card_payment' || form.financed) notifySafely(refreshScheduledNotifications(db), toast);
          navigation.goBack();
        },
      },
    );

  const save = async () => {
    setBudgetWarning(null);
    if (form.kind === 'expense' && Number.isInteger(form.amount) && form.amount > 0) {
      const prev = editingId ? await transactionsRepository.get(db, editingId) : null;
      const messages = [];
      if (form.category_id && periodSettings) {
        const exclude = prev && prev.kind === 'expense' ? prev.amount : 0;
        const warnings = await previewBudgetImpact(db, { categoryId: form.category_id, amount: form.amount, occurredAt: form.occurred_at, excludeAmount: exclude }, periodSettings);
        warnings.forEach(w => messages.push(`${w.budget.category_name || 'Presupuesto general'}: quedarías ${formatMoney(w.over)} por encima del límite de ${formatMoney(w.budget.amount)}.`));
      }
      // Límite de crédito de la tarjeta (aviso, no bloqueo).
      const acc = form.account_id ? await accountsRepository.get(db, form.account_id) : null;
      if (acc && acc.type === 'credit') {
        const previous = prev && prev.kind === 'expense' && prev.account_id === acc.id ? prev.amount : 0;
        const over = checkCreditCharge(creditSummary(acc), form.amount, previous);
        if (over) messages.push(`${acc.name}: este cargo supera tu crédito disponible por ${formatMoney(over.over)} (límite ${formatMoney(over.limit)}).`);
      }
      if (messages.length) {
        setBudgetWarning(messages);
        return;
      }
    }
    persist();
  };

  if (!loaded) return <Screen />;
  return (
    <Screen
      footer={
        <View style={styles.footer}>
          <Button title="Cancelar" variant="secondary" onPress={() => navigation.goBack()} style={styles.cancel} />
          <Button title={editingId ? 'Guardar cambios' : 'Guardar'} onPress={save} loading={saving} style={styles.save} />
        </View>
      }>
      <QuickExpenseForm value={form} onChange={setForm} errors={errors} editing={!!editingId} lockKind={!!editingId} />
      {errors.items || errors.id ? <AppText color={colors.coral}>{errors.items || errors.id}</AppText> : null}
      <ConfirmSheet
        visible={!!budgetWarning}
        title="Antes de guardar"
        message={budgetWarning ? budgetWarning.join('\n') + '\n\nPuedes guardarlo igualmente: estos avisos no bloquean tus registros.' : ''}
        confirmLabel="Guardar igualmente"
        onCancel={() => setBudgetWarning(null)}
        onConfirm={() => {
          setBudgetWarning(null);
          persist();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  footer: { flexDirection: 'row', gap: spacing.md },
  cancel: { flex: 1 },
  save: { flex: 2 },
});
