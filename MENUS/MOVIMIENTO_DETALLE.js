/**
 * MOVIMIENTO_DETALLE — ver, editar, duplicar, devolver o eliminar un movimiento.
 */
import React, { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, spacing } from '../config/theme';
import { ROUTES } from '../navigation/routes';
import { useDb } from '../hooks/DatabaseProvider';
import { useQuery } from '../hooks/useQuery';
import { transactionsRepository } from '../database/repositories/transactionsRepository';
import { deleteTransaction, duplicateTransaction } from '../services/transactions/transactionService';
import { checkImmediateAlerts } from '../services/notifications/notificationService';
import { INCOME_TYPE_LABELS, KIND_LABELS, PAYMENT_METHOD_LABELS } from '../services/transactions/rules';
import { formatDateTime, nowDateTime } from '../utils/dates';
import { formatMoney } from '../utils/money';
import AppText from '../components/common/AppText';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import ConfirmSheet from '../components/common/ConfirmSheet';
import EmptyState from '../components/common/EmptyState';
import ListRow from '../components/common/ListRow';
import Screen from '../components/common/Screen';
import { useToast } from '../components/common/Toast';
import CategoryIcon from '../components/CategoryIcon';

const ORIGIN = { manual: 'Registro manual', csv: 'Importado de CSV', recurring: 'Recurrencia confirmada', recurring_auto: 'Recurrencia automática' };

export default function MOVIMIENTO_DETALLE({ navigation, route }) {
  const db = useDb();
  const toast = useToast();
  const id = route.params.id;
  const [confirm, setConfirm] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const lock = useRef(false); // candado síncrono contra doble toque
  const { data: tx, loading } = useQuery(d => transactionsRepository.getDetailed(d, id), [id]);
  const { data: refunds = [] } = useQuery(
    d => d.all("SELECT id, amount, occurred_at FROM transactions WHERE related_transaction_id = ? AND kind = 'refund'", [id]),
    [id],
  );

  if (loading) return <Screen />;
  if (!tx) return <Screen><EmptyState icon="receipt" title="Movimiento no encontrado" message="Es posible que se haya eliminado." /></Screen>;

  const remove = async () => {
    setConfirm(false);
    await deleteTransaction(db, id);
    checkImmediateAlerts(db).catch(() => {});
    toast('Movimiento eliminado');
    navigation.goBack();
  };
  const duplicate = async () => {
    if (lock.current) return;
    lock.current = true;
    setDuplicating(true);
    try {
      const copy = await duplicateTransaction(db, id, nowDateTime());
      toast('Movimiento duplicado con fecha de hoy');
      navigation.replace(ROUTES.MOVIMIENTO_DETALLE, { id: copy.id });
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      lock.current = false;
      setDuplicating(false);
    }
  };
  const refunded = refunds.reduce((s, r) => s + r.amount, 0);
  const sign = tx.kind === 'income' || tx.kind === 'refund' ? '+' : tx.kind === 'expense' ? '-' : '';

  return (
    <Screen>
      <View style={styles.head}>
        <CategoryIcon icon={tx.category_icon || 'transfer'} color={tx.category_color || colors.violet} size={56} archived={tx.category_status === 'archived'} />
        <AppText variant="label" color={colors.textSecondary} style={styles.mt}>{KIND_LABELS[tx.kind]}</AppText>
        <AppText variant="display" color={sign === '+' ? colors.positive : colors.text}>{sign}{formatMoney(Math.abs(tx.amount))}</AppText>
        {tx.kind === 'adjustment' ? <AppText variant="caption" color={colors.textSecondary}>{tx.amount > 0 ? 'Aumentó' : 'Redujo'} el saldo de la cuenta</AppText> : null}
        {tx.description ? <AppText color={colors.textSecondary} style={styles.mt}>{tx.description}</AppText> : null}
      </View>

      <Card>
        <ListRow icon="calendar" title="Fecha" right={formatDateTime(tx.occurred_at)} />
        {tx.category_name ? <ListRow icon="list" title="Categoría" right={`${tx.category_name}${tx.category_status === 'archived' ? ' (archivada)' : ''}`} /> : null}
        <ListRow icon="wallet" title={tx.kind === 'transfer' || tx.kind === 'card_payment' ? 'Desde' : 'Cuenta'} right={tx.account_name} onPress={() => navigation.navigate(ROUTES.CUENTA_DETALLE, { id: tx.account_id })} />
        {tx.to_account_name ? <ListRow icon="transfer" title="Hacia" right={tx.to_account_name} onPress={() => navigation.navigate(ROUTES.CUENTA_DETALLE, { id: tx.to_account_id })} /> : null}
        {tx.payment_method ? <ListRow icon="card" title="Método de pago" right={PAYMENT_METHOD_LABELS[tx.payment_method]} /> : null}
        {tx.kind === 'income' ? <ListRow icon="salary" title="Tipo" right={INCOME_TYPE_LABELS[tx.income_type] || '—'} /> : null}
        {tx.source ? <ListRow icon="briefcase" title="Fuente" right={tx.source} /> : null}
        {tx.debt_name ? <ListRow icon="receipt" title="Financiación" right={tx.debt_name} onPress={() => navigation.navigate(ROUTES.DEUDA_DETALLE, { id: tx.debt_id })} /> : null}
        {tx.tags ? <ListRow icon="filter" title="Etiquetas" right={tx.tags} /> : null}
        {tx.kind === 'expense' && refunded ? <ListRow icon="refund" title="Devuelto" right={formatMoney(refunded)} /> : null}
        <ListRow icon="info" title="Origen" right={ORIGIN[tx.origin]} last />
      </Card>

      <View style={styles.actions}>
        <Button title="Editar" icon="edit" variant="secondary" onPress={() => navigation.navigate(ROUTES.MOVIMIENTO_FORM, { id })} style={styles.flex} />
        {tx.kind === 'expense' || tx.kind === 'income' ? <Button title="Duplicar" icon="copy" variant="secondary" onPress={duplicate} loading={duplicating} style={styles.flex} /> : null}
      </View>
      {tx.kind === 'expense' && refunded < tx.amount ? (
        <Button
          title="Registrar devolución"
          icon="refund"
          variant="secondary"
          style={styles.mtLg}
          onPress={() => navigation.navigate(ROUTES.MOVIMIENTO_FORM, { kind: 'refund', prefill: { category_id: tx.category_id, account_id: tx.account_id, related_transaction_id: tx.id, amount: tx.amount - refunded, description: `Devolución: ${tx.description || tx.category_name}` } })}
        />
      ) : null}
      <Button title="Eliminar" icon="trash" variant="danger" style={styles.mtLg} onPress={() => setConfirm(true)} />

      <ConfirmSheet
        visible={confirm}
        title="Eliminar movimiento"
        message={`Se eliminará ${KIND_LABELS[tx.kind].toLowerCase()} de ${formatMoney(Math.abs(tx.amount))}. Los saldos, presupuestos y estadísticas se recalcularán. Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        danger
        onCancel={() => setConfirm(false)}
        onConfirm={remove}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: 'center', marginBottom: spacing.xl },
  mt: { marginTop: spacing.sm },
  mtLg: { marginTop: spacing.md },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },
  flex: { flex: 1 },
});
