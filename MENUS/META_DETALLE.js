import React, { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, spacing } from '../config/theme';
import { ROUTES } from '../navigation/routes';
import { useDb } from '../hooks/DatabaseProvider';
import { useQuery } from '../hooks/useQuery';
import { accountsRepository } from '../database/repositories/accountsRepository';
import { deleteGoal, getGoal, goalMovements, moveGoalMoney, updateGoal } from '../services/goals/goalService';
import { formatDate, formatDateTime } from '../utils/dates';
import { formatMoney } from '../utils/money';
import AppText from '../components/common/AppText';
import AmountField from '../components/common/AmountField';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import ConfirmSheet from '../components/common/ConfirmSheet';
import EmptyState from '../components/common/EmptyState';
import ListRow from '../components/common/ListRow';
import ProgressBar from '../components/common/ProgressBar';
import Screen from '../components/common/Screen';
import SelectField from '../components/common/SelectField';
import Sheet from '../components/common/Sheet';
import TextField from '../components/common/TextField';
import { useToast } from '../components/common/Toast';

export default function META_DETALLE({ navigation, route }) {
  const db = useDb();
  const toast = useToast();
  const id = route.params.id;
  const [action, setAction] = useState(null);
  const [amount, setAmount] = useState(null);
  const [note, setNote] = useState('');
  const [accountId, setAccountId] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const [moving, setMoving] = useState(false);
  const lock = useRef(false); // candado síncrono contra doble toque
  const { data, loading, reload } = useQuery(async d => {
    const [goal, movements] = await Promise.all([getGoal(d, id), goalMovements(d, id)]);
    return { goal, movements };
  }, [id]);
  const { data: accounts = [] } = useQuery(d => accountsRepository.list(d), []);

  if (loading) return <Screen />;
  if (!data || !data.goal) return <Screen><EmptyState icon="target" title="Meta no encontrada" message="Es posible que se haya eliminado." /></Screen>;
  const { goal, movements } = data;
  const saved = goal.saved || 0;
  const remaining = Math.max(0, goal.target_amount - saved);
  const percent = goal.target_amount ? Math.min(1, saved / goal.target_amount) : 0;
  const options = accounts.filter(a => a.type !== 'credit').map(a => ({ value: a.id, label: a.name, color: a.color }));

  const closeAction = () => {
    setAction(null); setAmount(null); setNote(''); setAccountId(null);
  };
  const move = async () => {
    if (lock.current) return;
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      toast('Escribe un importe válido', 'error');
      return;
    }
    lock.current = true;
    setMoving(true);
    try {
      await moveGoalMoney(db, id, action === 'add' ? amount : -amount, action === 'add'
        ? { fromAccountId: accountId, note }
        : { toAccountId: accountId, note });
      closeAction();
      toast(action === 'add' ? 'Aportación registrada' : 'Retiro registrado');
      reload();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      lock.current = false;
      setMoving(false);
    }
  };
  const changeStatus = async () => {
    await updateGoal(db, id, { ...goal, status: goal.status === 'completed' ? 'active' : 'completed' });
    toast(goal.status === 'completed' ? 'Meta reactivada' : 'Meta completada');
    reload();
  };
  const archive = async () => {
    await updateGoal(db, id, { ...goal, status: 'archived' });
    toast('Meta archivada');
    navigation.goBack();
  };
  const remove = async () => {
    setConfirm(false);
    await deleteGoal(db, id);
    toast('Meta eliminada');
    navigation.goBack();
  };

  return (
    <Screen>
      <View style={styles.head}>
        <AppText variant="label" color={goal.color || colors.teal}>{goal.mode === 'virtual' ? 'Reserva virtual' : `En cuenta de ahorro: ${goal.account_name || 'sin cuenta'}`}</AppText>
        <AppText variant="title" style={styles.title}>{goal.name}</AppText>
        <AppText variant="display" color={goal.color || colors.teal}>{formatMoney(saved)}</AppText>
        <AppText variant="caption" color={colors.textSecondary}>acumulado de {formatMoney(goal.target_amount)}</AppText>
        <ProgressBar value={percent} color={goal.color || colors.teal} height={12} />
        <View style={styles.between}><AppText color={colors.textSecondary}>{remaining ? `Restan ${formatMoney(remaining)}` : 'Meta completada'}</AppText><AppText color={colors.textSecondary}>{Math.round(percent * 100)}%</AppText></View>
      </View>
      <Card>
        <AppText variant="caption" color={colors.textSecondary}>Cómo funciona</AppText>
        <AppText color={colors.textSecondary} style={styles.explain}>
          {goal.mode === 'account' ? 'En modo cuenta cada movimiento crea una transferencia; no es un gasto.' : 'En modo virtual el dinero sigue en tu cuenta y solo se aparta como reserva.'}
        </AppText>
        {goal.deadline ? <ListRow icon="calendar" title="Fecha límite" right={formatDate(goal.deadline)} /> : null}
        {goal.notes ? <ListRow icon="info" title="Notas" right={goal.notes} last /> : null}
      </Card>
      <View style={styles.actions}>
        <Button title="Aportar" icon="plus" onPress={() => setAction('add')} style={styles.flex} />
        <Button title="Retirar" icon="arrow-down" variant="secondary" onPress={() => setAction('remove')} style={styles.flex} />
      </View>
      <View style={styles.actions}>
        <Button title="Editar" icon="edit" variant="secondary" onPress={() => navigation.navigate(ROUTES.META_FORM, { id })} style={styles.flex} />
        <Button title={goal.status === 'completed' ? 'Reactivar' : 'Completar'} variant="secondary" onPress={changeStatus} style={styles.flex} />
      </View>
      <Button title="Archivar" variant="secondary" onPress={archive} style={styles.archive} />
      <AppText variant="subtitle" style={styles.section}>Historial</AppText>
      {movements.length ? <Card>{movements.map(m => (
        <View key={m.id} style={styles.movement}>
          <View style={styles.flex}><AppText variant="small">{m.note}</AppText><AppText variant="caption" color={colors.textSecondary}>{formatDateTime(m.occurred_at)}{m.account_name ? ` · ${m.account_name}` : ''}</AppText></View>
          <AppText variant="subtitle" color={m.amount >= 0 ? colors.positive : colors.coral}>{m.amount >= 0 ? '+' : ''}{formatMoney(m.amount)}</AppText>
        </View>
      ))}</Card> : <EmptyState compact icon="list" title="Sin movimientos" message="Tus aportaciones y retiros aparecerán aquí." />}
      <Button title="Eliminar meta" icon="trash" variant="danger" onPress={() => setConfirm(true)} style={styles.delete} />
      <Sheet visible={!!action} onClose={closeAction} title={action === 'add' ? 'Aportar a la meta' : 'Retirar de la meta'} footer={<Button title={action === 'add' ? 'Registrar aportación' : 'Registrar retiro'} onPress={move} loading={moving} />}>
        <AmountField label="Importe" value={amount} onChange={setAmount} large />
        {goal.mode === 'account' ? <SelectField label={action === 'add' ? 'Cuenta de origen' : 'Cuenta destino'} value={accountId} options={options} onChange={setAccountId} placeholder="Selecciona una cuenta" emptyText="No hay cuentas disponibles." /> : null}
        <TextField label="Nota (opcional)" value={note} onChangeText={setNote} placeholder={action === 'add' ? 'Ej. Ahorro quincenal' : 'Ej. Retiro para el viaje'} />
      </Sheet>
      <ConfirmSheet visible={confirm} title="Eliminar meta" message={goal.mode === 'account' ? 'Se eliminará la meta, pero las transferencias ya hechas se conservarán.' : 'Se eliminará la meta y sus reservas. Esta acción no se puede deshacer.'} confirmLabel="Eliminar" danger onCancel={() => setConfirm(false)} onConfirm={remove} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: 'center', marginBottom: spacing.xl },
  title: { marginTop: spacing.sm, marginBottom: spacing.md },
  between: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
  explain: { marginTop: spacing.sm, marginBottom: spacing.sm, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  flex: { flex: 1 },
  section: { marginTop: spacing.xl, marginBottom: spacing.md },
  movement: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  archive: { marginTop: spacing.md },
  delete: { marginTop: spacing.xl },
});
