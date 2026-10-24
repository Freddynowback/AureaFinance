/**
 * DEUDA_DETALLE — saldo, recomendador de pagos, apartados, pagos reales,
 * actualización manual (conciliación) e historial de la deuda.
 */
import React, { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { colors, spacing } from '../config/theme';
import { ROUTES } from '../navigation/routes';
import { useDb } from '../hooks/DatabaseProvider';
import { useQuery } from '../hooks/useQuery';
import { useSubmit } from '../hooks/useSubmit';
import { accountsRepository } from '../database/repositories/accountsRepository';
import { deleteDebt, FINANCING_LABELS, getDebtDetail, reconcileDebt, registerDebtPayment, reserveForDebt, updateDebt } from '../services/debts/debtService';
import { buildDebtContext } from '../services/debts/debtContext';
import { pendingInstallments } from '../services/debts/recommender';
import { refreshScheduledNotifications } from '../services/notifications/notificationService';
import { formatDate, formatDateTime, nowDateTime, todayISO } from '../utils/dates';
import { formatMoney } from '../utils/money';
import AmountField from '../components/common/AmountField';
import AppText from '../components/common/AppText';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import ConfirmSheet from '../components/common/ConfirmSheet';
import DateTimeField from '../components/common/DateTimeField';
import EmptyState from '../components/common/EmptyState';
import ListRow from '../components/common/ListRow';
import Screen from '../components/common/Screen';
import SectionHeader from '../components/common/SectionHeader';
import SelectField from '../components/common/SelectField';
import Sheet from '../components/common/Sheet';
import TextField from '../components/common/TextField';
import LineChart from '../components/charts/LineChart';
import DebtPaymentPlan from '../components/DebtPaymentPlan';

// El plan de pagos llega hasta la última mensualidad; sin mensualidades, al próximo vencimiento.
function lastInstallmentDate(debt) {
  const items = pendingInstallments(debt);
  return items ? items[items.length - 1].date : debt.effectiveDueDate;
}

async function load(db, id) {
  const detail = await getDebtDetail(db, id);
  if (!detail) return null;
  const [context, accounts] = await Promise.all([
    buildDebtContext(db, id, { deadline: lastInstallmentDate(detail.debt) }),
    accountsRepository.list(db),
  ]);
  return { ...detail, context, payFrom: accounts.filter(a => a.type !== 'credit') };
}

export default function DEUDA_DETALLE({ navigation, route }) {
  const db = useDb();
  const id = route.params.id;
  const { data, loading } = useQuery(d => load(d, id), [id]);
  const { submit, saving, errors } = useSubmit();
  const [sheet, setSheet] = useState(null); // 'pay' | 'reserve' | 'release' | 'reconcile'
  const [amount, setAmount] = useState(null);
  const [fromAccount, setFromAccount] = useState(null);
  const [date, setDate] = useState(nowDateTime());
  const [releaseReserved, setReleaseReserved] = useState(true);
  const [note, setNote] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (loading && !data) return <Screen />;
  if (!data) return <Screen><EmptyState icon="card" title="Deuda no encontrada" /></Screen>;
  const { debt, history, reservations } = data;
  const outstanding = Math.max(0, debt.outstanding);

  const open = (kind, preset = null) => {
    setAmount(preset);
    setNote('');
    setDate(nowDateTime());
    // Cada apertura empieza con valores por defecto (no hereda los del pago anterior).
    setReleaseReserved(true);
    setFromAccount(data.payFrom.length ? data.payFrom[0].id : null);
    setSheet(kind);
  };
  const done = msg => ({ success: msg, onDone: () => { setSheet(null); refreshScheduledNotifications(db).catch(() => {}); } });

  const confirm = () => {
    if (sheet === 'pay') {
      return submit(() => registerDebtPayment(db, { debtId: id, fromAccountId: fromAccount, amount, occurredAt: date, releaseReserved }), done('Pago registrado: la deuda se redujo'));
    }
    if (sheet === 'reserve') return submit(() => reserveForDebt(db, id, amount, { note }), done('Dinero apartado (no se movió dinero)'));
    if (sheet === 'release') return submit(() => reserveForDebt(db, id, -amount, { note }), done('Apartado liberado'));
    return submit(() => reconcileDebt(db, id, amount, { note }), done('Saldo actualizado (conciliación, no es un gasto)'));
  };

  const chartPoints = history.map(h => ({ label: formatDate(h.date.slice(0, 10), { withYear: false }), value: h.balanceAfter }));

  return (
    <Screen>
      <AppText variant="caption" color={colors.textSecondary}>
        {FINANCING_LABELS[debt.financing_type]} · {debt.account_name || 'Sin tarjeta'}
        {debt.schedule ? ' · calendario de pagos' : ''}
        {debt.installmentsLeft !== null && debt.installmentsLeft !== undefined ? ` · ${debt.installmentsLeft} ${debt.schedule ? (debt.installmentsLeft === 1 ? 'mes restante' : 'meses restantes') : 'cuotas restantes'}` : ''}
        {debt.interest_rate_bp !== null && debt.interest_rate_bp !== undefined ? ` · tasa ${debt.interest_rate_bp / 100}% anual` : ''}
      </AppText>

      <View style={styles.mtLg}>
        <DebtPaymentPlan
          debt={debt}
          today={todayISO()}
          context={data.context}
          onReserve={perPeriod => open('reserve', perPeriod)}
          onRegisterPayment={() => open('pay', debt.monthlyDue !== null ? debt.monthlyDue : outstanding)}
        />
      </View>

      {debt.schedule ? <ScheduleCard debt={debt} /> : null}

      <View style={styles.row}>
        <Button title="Actualizar saldo" icon="edit" variant="secondary" small style={styles.flex} onPress={() => open('reconcile', outstanding)} />
        {debt.reserved > 0 ? <Button title="Liberar apartado" icon="refund" variant="secondary" small style={styles.flex} onPress={() => open('release', debt.reserved)} /> : null}
      </View>
      <AppText variant="caption" color={colors.textMuted} style={styles.mt}>
        Actualiza el saldo cada mes con el de tu estado de cuenta: se guarda como conciliación y conserva el historial.
        {debt.balance_updated_at ? ` Última actualización: ${formatDate(debt.balance_updated_at)}.` : ''}
      </AppText>

      {chartPoints.length > 1 ? (
        <>
          <SectionHeader title="Evolución del saldo" />
          <Card><LineChart points={chartPoints} color={colors.coral} /></Card>
        </>
      ) : null}

      <SectionHeader title="Historial" />
      <Card>
        {history.slice().reverse().map((h, i, arr) => (
          <ListRow
            key={h.id}
            icon={h.type === 'payment' ? 'check' : 'edit'}
            iconColor={h.type === 'payment' ? colors.teal : colors.violet}
            title={h.type === 'payment' ? `Pago ${formatMoney(h.amount)}` : `Saldo conciliado ${formatMoney(h.amount)}`}
            subtitle={`${formatDateTime(h.date)}${h.account_name ? ` · desde ${h.account_name}` : ''}${h.note ? ` · ${h.note}` : ''}`}
            right={formatMoney(h.balanceAfter)}
            onPress={h.type === 'payment' ? () => navigation.navigate(ROUTES.MOVIMIENTO_DETALLE, { id: h.id }) : undefined}
            last={i === arr.length - 1}
          />
        ))}
      </Card>

      {reservations.length ? (
        <>
          <SectionHeader title="Dinero apartado" />
          <Card>
            {reservations.slice(0, 10).map((r, i, arr) => (
              <ListRow key={r.id} icon="piggy" iconColor={colors.gold} title={r.note || 'Apartado'} subtitle={formatDateTime(r.occurred_at)} right={formatMoney(r.amount, 'MXN', { sign: true })} last={i === arr.length - 1} />
            ))}
          </Card>
        </>
      ) : null}

      <View style={[styles.row, styles.mtLg]}>
        <Button title="Editar" icon="edit" variant="secondary" style={styles.flex} onPress={() => navigation.navigate(ROUTES.DEUDA_FORM, { id })} />
        <Button
          title={debt.status === 'active' ? 'Marcar liquidada' : 'Reactivar'}
          icon="check"
          variant="secondary"
          style={styles.flex}
          onPress={() => submit(() => updateDebt(db, id, { status: debt.status === 'active' ? 'paid' : 'active' }), { success: 'Estado actualizado' })}
        />
      </View>
      <Button title="Eliminar deuda" icon="trash" variant="danger" style={styles.mt} onPress={() => setConfirmDelete(true)} />

      <Sheet
        visible={!!sheet}
        onClose={() => setSheet(null)}
        title={{ pay: 'Registrar pago', reserve: 'Apartar dinero', release: 'Liberar apartado', reconcile: 'Actualizar saldo pendiente' }[sheet] || ''}
        footer={<Button title="Confirmar" onPress={confirm} loading={saving} />}>
        {sheet === 'pay' ? (
          <>
            <AppText variant="small" color={colors.textSecondary} style={styles.mb}>
              Se registra un pago a {debt.account_name}: sale dinero de la cuenta elegida y baja la deuda de esta tarjeta y de esta financiación. No cuenta como gasto (la compra ya se contó).
            </AppText>
            <AmountField label="Importe pagado" value={amount} onChange={setAmount} error={errors.amount} autoFocus />
            <SelectField label="Pagado desde" value={fromAccount} onChange={setFromAccount} options={data.payFrom.map(a => ({ value: a.id, label: a.name, sublabel: `Saldo ${formatMoney(a.balance)}` }))} error={errors.account_id} />
            <DateTimeField label="Fecha del pago" value={date} onChange={setDate} />
            {debt.reserved > 0 ? (
              <View style={styles.switchRow}>
                <AppText style={styles.flex}>Usar lo apartado ({formatMoney(debt.reserved)}) para este pago</AppText>
                <Switch value={releaseReserved} onValueChange={setReleaseReserved} trackColor={{ true: colors.teal, false: colors.border }} thumbColor={colors.text} />
              </View>
            ) : null}
          </>
        ) : sheet === 'reconcile' ? (
          <>
            <AppText variant="small" color={colors.textSecondary} style={styles.mb}>
              Escribe el saldo pendiente actual según tu banco. Se guarda como conciliación: no crea gastos ni pagos. Los pagos que registres después se restarán de este saldo.
            </AppText>
            <AmountField label="Saldo pendiente real" value={amount} onChange={setAmount} error={errors.balance} autoFocus />
            <TextField label="Nota (opcional)" value={note} onChangeText={setNote} placeholder="Estado de cuenta de octubre" />
          </>
        ) : (
          <>
            <AppText variant="small" color={colors.textSecondary} style={styles.mb}>
              {sheet === 'reserve'
                ? 'Apartar es una reserva: el dinero sigue en tus cuentas pero deja de contarse como disponible. No reduce la deuda hasta que registres el pago.'
                : 'El dinero liberado vuelve a contarse como disponible.'}
            </AppText>
            <AmountField label="Importe" value={amount} onChange={setAmount} error={errors.amount} autoFocus />
            <TextField label="Nota (opcional)" value={note} onChangeText={setNote} />
          </>
        )}
      </Sheet>

      <ConfirmSheet
        visible={confirmDelete}
        title="Eliminar deuda"
        message="Se eliminará el plan, su historial de saldos y lo apartado. Los pagos ya registrados se conservan como movimientos de la tarjeta."
        danger
        confirmLabel="Eliminar"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setConfirmDelete(false);
          await deleteDebt(db, id);
          navigation.goBack();
        }}
      />
    </Screen>
  );
}

/** Meses capturados: pagados, el del mes (puede ir en parte) y los que faltan. */
function ScheduleCard({ debt }) {
  const { items, pending, paidCount, excess } = debt.schedule;
  const pendingByDate = Object.fromEntries(pending.map(p => [p.due_date, p]));
  const today = todayISO();
  return (
    <>
      <SectionHeader title="Calendario de pagos" />
      <Card>
        {items.map((it, i) => {
          const p = pendingByDate[it.due_date];
          const paid = i < paidCount;
          const partial = p && p.amount < p.full;
          const overdue = !paid && it.due_date < today;
          const status = paid ? 'Pagado' : partial ? `Falta ${formatMoney(p.amount)}` : overdue ? 'Vencido' : i === paidCount ? 'Este mes' : 'Pendiente';
          return (
            <ListRow
              key={it.id}
              icon={paid ? 'check' : 'calendar'}
              iconColor={paid ? colors.teal : overdue ? colors.coral : colors.gold}
              title={formatDate(it.due_date)}
              subtitle={status}
              right={formatMoney(it.amount)}
              last={i === items.length - 1}
            />
          );
        })}
      </Card>
      <AppText variant="caption" color={colors.textMuted} style={styles.mt}>
        Los meses los capturaste tú desde tu banco. Cada pago registrado en esta financiación cubre primero el mes más antiguo. Si tu banco cambia los montos, edítalos en "Editar".
        {excess > 0 ? ` El saldo pendiente supera la suma del calendario por ${formatMoney(excess)}: revisa los meses.` : ''}
      </AppText>
    </>
  );
}

const styles = StyleSheet.create({
  mt: { marginTop: spacing.sm },
  mtLg: { marginTop: spacing.lg },
  mb: { marginBottom: spacing.lg, lineHeight: 19 },
  row: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
  switchRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
});
