/**
 * GASTO_DIARIO — "¿Cuánto puedo gastar hoy?": desglose del cálculo, colchón y
 * gastos planeados (p. ej. una salida el sábado).
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { colors, radii, spacing } from '../config/theme';
import { ROUTES } from '../navigation/routes';
import { useDb } from '../hooks/DatabaseProvider';
import { useQuery } from '../hooks/useQuery';
import { useSettings } from '../hooks/useSettings';
import { useSubmit } from '../hooks/useSubmit';
import { PLAN_LABELS } from '../services/debts/recommender';
import { addPlannedSpend, deletePlannedSpend, getDailyAllowance } from '../services/stats/dailyAllowanceService';
import { addDays, formatDate, todayISO } from '../utils/dates';
import { formatMoney } from '../utils/money';
import AmountField from '../components/common/AmountField';
import AppText from '../components/common/AppText';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import DateTimeField from '../components/common/DateTimeField';
import Screen from '../components/common/Screen';
import SectionHeader from '../components/common/SectionHeader';
import TextField from '../components/common/TextField';

const COMMITMENT_LABEL = { card: 'Pago de tarjeta', debt: 'Mensualidad', recurring: 'Gasto recurrente' };

function Line({ label, value, sub, strong, color }) {
  return (
    <View style={styles.line}>
      <View style={styles.flex}>
        <AppText variant={strong ? 'subtitle' : 'small'}>{label}</AppText>
        {sub ? <AppText variant="caption" color={colors.textMuted}>{sub}</AppText> : null}
      </View>
      <AppText variant={strong ? 'subtitle' : 'amount'} color={color}>{value}</AppText>
    </View>
  );
}

export default function GASTO_DIARIO({ navigation }) {
  const db = useDb();
  const { settings, periodSettings, update } = useSettings();
  const { submit, saving, errors } = useSubmit();
  const cushionSetting = settings ? settings['daily.cushion'] : 0;
  const frequencies = settings ? settings['plan.frequency'] : null;
  const includeLater = settings ? settings['daily.includeLater'] !== false : true;
  const { data: a } = useQuery(
    d => (periodSettings ? getDailyAllowance(d, { periodSettings, cushion: cushionSetting, frequencies, includeLater }) : Promise.resolve(null)),
    [periodSettings, cushionSetting, frequencies, includeLater],
  );
  const [cushion, setCushion] = useState(null);
  const [planDate, setPlanDate] = useState(addDays(todayISO(), 1));
  const [planAmount, setPlanAmount] = useState(null);
  const [planNote, setPlanNote] = useState('');

  useEffect(() => {
    if (settings) setCushion(settings['daily.cushion'] || null);
  }, [settings]);

  if (!a) return <Screen />;
  const over = a.leftToday < 0;
  const horizonText = a.horizonSource === 'income'
    ? `tu ingreso del ${formatDate(a.horizon, { withYear: false })} (${a.income.name})`
    : `el fin del periodo (${formatDate(addDays(a.horizon, -1), { withYear: false })})`;

  const savePlan = () => submit(
    () => addPlannedSpend(db, { planned_date: planDate, amount: planAmount, note: planNote }),
    { success: 'Gasto planeado', onDone: () => { setPlanAmount(null); setPlanNote(''); } },
  );

  return (
    <Screen>
      <Card animate={false} style={styles.hero}>
        <AppText variant="label" color={colors.textSecondary}>Hoy puedes gastar</AppText>
        <AppText variant="amountLg" color={a.allowance > 0 ? colors.teal : colors.coral}>{formatMoney(a.allowance)}</AppText>
        <AppText variant="small" color={over ? colors.coral : colors.textSecondary}>
          {a.spentToday > 0
            ? over
              ? `Llevas ${formatMoney(a.spentToday)}: te pasaste ${formatMoney(-a.leftToday)}`
              : `Llevas ${formatMoney(a.spentToday)} · te quedan ${formatMoney(a.leftToday)}`
            : 'Aún no gastas hoy'}
        </AppText>
        {a.tomorrowAllowance !== null ? (
          <AppText variant="caption" color={colors.textMuted} style={styles.mtXs}>
            Si no gastas más hoy, mañana podrás gastar {formatMoney(a.tomorrowAllowance)}.
          </AppText>
        ) : null}
        {a.plannedToday > 0 ? (
          <AppText variant="caption" color={colors.gold} style={styles.mtXs}>Incluye {formatMoney(a.plannedToday)} planeados para hoy.</AppText>
        ) : null}
      </Card>

      {a.shortfall > 0 ? (
        <AppText variant="small" color={colors.coral} style={styles.notice}>
          Te faltan {formatMoney(a.shortfall)} para cubrir tus pagos{a.plannedTotal ? ', lo planeado' : ''}{a.cushion ? ' y el colchón' : ''} antes de {horizonText}.
        </AppText>
      ) : null}
      {a.pendingIncome ? (
        <AppText variant="small" color={colors.gold} style={styles.notice}>
          Tu ingreso del {formatDate(a.pendingIncome.date, { withYear: false })} ({a.pendingIncome.name}) no se ha registrado: no cuenta hasta que lo confirmes en Ingresos.
        </AppText>
      ) : null}
      {a.withoutPlan.length ? (
        <AppText variant="small" color={colors.gold} style={styles.notice}>
          Sin mensualidad capturada (no se incluye): {a.withoutPlan.join(', ')}. Captúrala en la deuda para que cuente.
        </AppText>
      ) : null}
      {a.horizonSource === 'period' ? (
        <AppText variant="small" color={colors.textSecondary} style={styles.notice}>
          No tienes un ingreso recurrente: se reparte hasta el fin del periodo. Configura tu salario en Ingresos para un cálculo más preciso.
        </AppText>
      ) : null}

      <SectionHeader title="Cómo se calcula" />
      <Card animate={false}>
        <View style={styles.line}>
          <View style={styles.flex}>
            <AppText variant="small">Incluir pagos lejanos</AppText>
            <AppText variant="caption" color={colors.textMuted}>
              {includeLater ? 'El próximo pago de cada tarjeta y deuda se aparta desde hoy, aunque venza mucho después.' : 'Solo se aparta en los periodos previos a cada pago.'}
            </AppText>
          </View>
          <Switch
            value={includeLater}
            onValueChange={v => update({ 'daily.includeLater': v })}
            trackColor={{ true: colors.teal, false: colors.border }}
            thumbColor={colors.text}
            accessibilityLabel="Incluir pagos lejanos"
          />
        </View>
        <Line label="Dinero disponible" sub="Saldo líquido menos lo apartado" value={formatMoney(a.available)} />
        {a.commitments.map(c => (
          <Line
            key={`${c.type}-${c.name}-${c.date}`}
            label={`− ${c.name}`}
            sub={c.partial
              ? `Apartar (${PLAN_LABELS[c.frequency].toLowerCase()}) para el pago del ${formatDate(c.date, { withYear: false })}`
              : `${COMMITMENT_LABEL[c.type]} · ${formatDate(c.date, { withYear: false })}`}
            value={formatMoney(c.amount)}
            color={colors.coral}
          />
        ))}
        {a.cushion > 0 ? <Line label="− Colchón" value={formatMoney(a.cushion)} color={colors.coral} /> : null}
        {a.plannedTotal > 0 ? <Line label="− Gastos planeados" value={formatMoney(a.plannedTotal)} color={colors.gold} /> : null}
        {a.spentToday > 0 ? <Line label="+ Lo que ya gastaste hoy" sub="Cuenta dentro de lo de hoy" value={formatMoney(a.spentToday)} /> : null}
        <Line label="Libre para repartir" value={formatMoney(Math.max(0, a.free - a.plannedTotal))} strong />
        <Line label={`÷ ${a.days} ${a.days === 1 ? 'día' : 'días'}`} sub={`Hasta ${horizonText}`} value={`${formatMoney(a.perDay)} al día`} strong color={colors.teal} />
        <AppText variant="caption" color={colors.textMuted} style={styles.mtSm}>
          Se recalcula cada día: lo que gastes de más o de menos se reparte en los días que faltan. De cada tarjeta y deuda se resta lo que toca apartar antes de tu ingreso, con el periodo que elegiste en su plan de pago; lo ya apartado cuenta primero.
        </AppText>
      </Card>

      {a.afterIncome.length ? (
        <>
          <SectionHeader title="Después de tu ingreso" />
          <Card animate={false}>
            {a.afterIncome.map(c => (
              <Line key={`${c.name}-${c.date}`} label={c.name} sub={`Vence el ${formatDate(c.date, { withYear: false })}`} value={formatMoney(c.amount)} color={colors.gold} />
            ))}
            <AppText variant="caption" color={colors.textMuted} style={styles.mtSm}>
              Tu próximo ingreso debe cubrir estos pagos.
            </AppText>
          </Card>
        </>
      ) : null}

      <SectionHeader title="Gastos planeados" />
      <Card animate={false}>
        <AppText variant="caption" color={colors.textSecondary} style={styles.mbSm}>
          ¿Una salida o una compra en un día concreto? Apártala: los días previos bajan un poco y ese día la tendrás libre.
        </AppText>
        {a.planned.map(p => (
          <View key={p.id} style={styles.line}>
            <View style={styles.flex}>
              <AppText variant="small">{p.note || 'Gasto planeado'}</AppText>
              <AppText variant="caption" color={colors.textMuted}>{formatDate(p.planned_date, { withWeekday: true, withYear: false })}</AppText>
            </View>
            <AppText variant="amount" color={colors.gold}>{formatMoney(p.amount)}</AppText>
            <Button title="Quitar" variant="secondary" small style={styles.ml} onPress={() => submit(() => deletePlannedSpend(db, p.id), { success: 'Gasto planeado quitado' })} />
          </View>
        ))}
        <DateTimeField label="Fecha" mode="date" value={planDate} onChange={setPlanDate} />
        {errors.planned_date ? <AppText variant="caption" color={colors.coral}>{errors.planned_date}</AppText> : null}
        <AmountField label="Monto" value={planAmount} onChange={setPlanAmount} error={errors.amount} />
        <TextField label="Para qué (opcional)" value={planNote} onChangeText={setPlanNote} placeholder="Ej. Salida con mi novia" />
        <Button title="Planear gasto" icon="plus" onPress={savePlan} loading={saving} />
      </Card>

      <SectionHeader title="Colchón para imprevistos" />
      <Card animate={false}>
        <AppText variant="caption" color={colors.textSecondary} style={styles.mbSm}>
          Monto que no se cuenta como libre para gastar. Puede ser cero.
        </AppText>
        <AmountField label="Colchón" value={cushion} onChange={setCushion} />
        <Button title="Guardar colchón" variant="secondary" onPress={() => submit(() => update({ 'daily.cushion': cushion || 0 }), { success: 'Colchón guardado' })} />
      </Card>

      <Button title="Ver ingresos y gastos recurrentes" variant="secondary" style={styles.mtLg} onPress={() => navigation.navigate(ROUTES.INGRESOS)} />
      <View style={{ height: spacing.xxl }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { borderColor: colors.teal, borderRadius: radii.lg },
  line: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  flex: { flex: 1, marginRight: spacing.sm },
  ml: { marginLeft: spacing.sm },
  notice: { marginTop: spacing.md },
  mtXs: { marginTop: spacing.xs },
  mtSm: { marginTop: spacing.sm },
  mbSm: { marginBottom: spacing.md },
  mtLg: { marginTop: spacing.lg },
});
