/**
 * BIENVENIDA — onboarding de primera ejecución (sin header de navegación).
 * Pasos:
 *  1. Presentación de marca y 3 puntos clave
 *  2. Configuración del periodo financiero del círculo
 *  3. Creación opcional de la primera cuenta
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInRight } from 'react-native-reanimated';
import { BRAND } from '../config/brand';
import { colors, radii, spacing } from '../config/theme';
import { ROUTES } from '../navigation/routes';
import { useDb } from '../hooks/DatabaseProvider';
import { useSettings } from '../hooks/useSettings';
import { useToast } from '../components/common/Toast';
import { PERIOD_LABELS } from '../utils/periods';
import { ACCOUNT_TYPE_LABELS } from '../services/transactions/rules';
import { createAccount } from '../services/accounts/accountService';
import AmountField from '../components/common/AmountField';
import AppText from '../components/common/AppText';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import Icon from '../components/common/Icon';
import Screen from '../components/common/Screen';
import Segmented from '../components/common/Segmented';
import TextField from '../components/common/TextField';

const PERIOD_OPTIONS = [
  { value: 'daily', label: PERIOD_LABELS.daily },
  { value: 'weekly', label: PERIOD_LABELS.weekly },
  { value: 'biweekly', label: PERIOD_LABELS.biweekly },
  { value: 'monthly', label: PERIOD_LABELS.monthly },
];

const WEEK_START_OPTIONS = [
  { value: 1, label: 'Lunes' },
  { value: 0, label: 'Domingo' },
];

const ACCOUNT_TYPE_OPTIONS = [
  { value: 'cash', label: ACCOUNT_TYPE_LABELS.cash },
  { value: 'debit', label: ACCOUNT_TYPE_LABELS.debit },
  { value: 'savings', label: ACCOUNT_TYPE_LABELS.savings },
  { value: 'credit', label: ACCOUNT_TYPE_LABELS.credit },
];

export default function BIENVENIDA({ navigation }) {
  const db = useDb();
  const toast = useToast();
  const { update } = useSettings();

  const [step, setStep] = useState(0); // 0: bienvenida, 1: periodo, 2: cuenta
  const [periodType, setPeriodType] = useState('weekly');
  const [weekStartDay, setWeekStartDay] = useState(1); // 1 = Lunes

  // Datos de cuenta opcional
  const [accountName, setAccountName] = useState('Efectivo');
  const [accountType, setAccountType] = useState('cash');
  const [openingAmount, setOpeningAmount] = useState(null);

  const [submitting, setSubmitting] = useState(false);

  const handleFinish = async (shouldCreateAccount = false) => {
    setSubmitting(true);
    try {
      if (shouldCreateAccount) {
        const name = accountName.trim() || 'Efectivo';
        await createAccount(db, {
          name,
          type: accountType,
          openingAmount: openingAmount || 0,
        });
      }
      await update({
        'onboarding.done': true,
        'period.type': periodType,
        'period.weekStartDay': weekStartDay,
      });
      navigation.reset({ index: 0, routes: [{ name: ROUTES.TABS }] });
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen topInset scroll padded>
      {/* Indicador de 3 pasos */}
      <View style={styles.stepperContainer}>
        {[0, 1, 2].map(idx => (
          <View
            key={idx}
            style={[
              styles.stepBar,
              idx === step
                ? styles.stepBarActive
                : idx < step
                  ? styles.stepBarCompleted
                  : styles.stepBarInactive,
            ]}
          />
        ))}
      </View>

      {step === 0 ? (
        <Animated.View key="step-0" entering={FadeIn.duration(260)} style={styles.stepWrap}>
          <View style={styles.heroSection}>
            <View style={styles.logoBadge}>
              <Icon name="spark" size={32} color={BRAND.accent} />
            </View>
            <AppText variant="display" color={colors.text} style={styles.heroTitle}>
              {BRAND.name}
            </AppText>
            <AppText variant="subtitle" color={colors.textSecondary} style={styles.heroTagline}>
              {BRAND.tagline}
            </AppText>
          </View>

          <Card style={styles.pointsCard}>
            <View style={styles.pointRow}>
              <View style={[styles.pointIconCircle, { backgroundColor: colors.tealSoft }]}>
                <Icon name="check" size={18} color={colors.teal} />
              </View>
              <View style={styles.pointTextWrap}>
                <AppText variant="subtitle" color={colors.text}>
                  Todo local en tu teléfono
                </AppText>
                <AppText variant="small" color={colors.textSecondary} style={styles.mtXs}>
                  Sin conexión bancaria obligatoria: tus datos se guardan solo en este dispositivo.
                </AppText>
              </View>
            </View>

            <View style={[styles.pointRow, styles.pointDivider]}>
              <View style={[styles.pointIconCircle, { backgroundColor: colors.goldSoft }]}>
                <Icon name="bolt" size={18} color={colors.gold} />
              </View>
              <View style={styles.pointTextWrap}>
                <AppText variant="subtitle" color={colors.text}>
                  Registra en segundos
                </AppText>
                <AppText variant="small" color={colors.textSecondary} style={styles.mtXs}>
                  Apunta tus gastos del día a día de forma ágil y sin complicaciones.
                </AppText>
              </View>
            </View>

            <View style={[styles.pointRow, styles.pointDivider]}>
              <View style={[styles.pointIconCircle, { backgroundColor: colors.violetSoft }]}>
                <Icon name="target" size={18} color={colors.violet} />
              </View>
              <View style={styles.pointTextWrap}>
                <AppText variant="subtitle" color={colors.text}>
                  Deudas y presupuestos claros
                </AppText>
                <AppText variant="small" color={colors.textSecondary} style={styles.mtXs}>
                  Visualiza tus límites de gasto, dinero apartado y fechas de pago con certeza.
                </AppText>
              </View>
            </View>
          </Card>

          <Button
            title="Continuar"
            onPress={() => setStep(1)}
            style={styles.mtLg}
          />
        </Animated.View>
      ) : null}

      {step === 1 ? (
        <Animated.View key="step-1" entering={FadeInRight.duration(280)} style={styles.stepWrap}>
          <AppText variant="label" color={colors.teal}>Paso 2 de 3</AppText>
          <AppText variant="title" style={styles.stepTitle}>Periodo del círculo</AppText>
          <AppText variant="body" color={colors.textSecondary} style={styles.stepDesc}>
            El círculo financiero muestra tu gasto y restante durante un periodo recurrente. Elige con qué frecuencia prefieres organizarte.
          </AppText>

          <Card style={styles.configCard}>
            <AppText variant="caption" color={colors.textSecondary} style={styles.fieldLabel}>
              Frecuencia del periodo
            </AppText>
            <Segmented
              options={PERIOD_OPTIONS}
              value={periodType}
              onChange={setPeriodType}
            />

            {periodType === 'weekly' ? (
              <View style={styles.mtMd}>
                <AppText variant="caption" color={colors.textSecondary} style={styles.fieldLabel}>
                  Día de inicio de semana
                </AppText>
                <Segmented
                  options={WEEK_START_OPTIONS}
                  value={weekStartDay}
                  onChange={setWeekStartDay}
                />
              </View>
            ) : null}
          </Card>

          <View style={styles.buttonRow}>
            <Button
              title="Atrás"
              variant="secondary"
              onPress={() => setStep(0)}
              style={styles.flexBtn}
            />
            <Button
              title="Continuar"
              onPress={() => setStep(2)}
              style={styles.flexBtn}
            />
          </View>
        </Animated.View>
      ) : null}

      {step === 2 ? (
        <Animated.View key="step-2" entering={FadeInRight.duration(280)} style={styles.stepWrap}>
          <AppText variant="label" color={colors.teal}>Paso 3 de 3</AppText>
          <AppText variant="title" style={styles.stepTitle}>Primera cuenta (opcional)</AppText>
          <AppText variant="body" color={colors.textSecondary} style={styles.stepDesc}>
            Crea tu cuenta principal para empezar a registrar movimientos. Puedes omitir este paso y crear cuentas más tarde.
          </AppText>

          <Card style={styles.configCard}>
            <TextField
              label="Nombre de la cuenta"
              value={accountName}
              onChangeText={setAccountName}
              placeholder="Ej. Efectivo, Cuenta de débito..."
            />

            <View style={styles.mbLg}>
              <AppText variant="caption" color={colors.textSecondary} style={styles.fieldLabel}>
                Tipo de cuenta
              </AppText>
              <Segmented
                options={ACCOUNT_TYPE_OPTIONS}
                value={accountType}
                onChange={setAccountType}
              />
            </View>

            <AmountField
              label={accountType === 'credit' ? 'Deuda actual' : 'Saldo actual'}
              value={openingAmount}
              onChange={setOpeningAmount}
              hint={accountType === 'credit' ? 'Escribe la deuda pendiente como número positivo' : 'Saldo disponible al iniciar'}
            />
          </Card>

          <Button
            title="Guardar y empezar"
            onPress={() => handleFinish(true)}
            loading={submitting}
            style={styles.mtLg}
          />

          <Button
            title="Omitir"
            variant="ghost"
            onPress={() => handleFinish(false)}
            disabled={submitting}
            style={styles.mtSm}
          />
        </Animated.View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stepperContainer: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, marginBottom: spacing.xl },
  stepBar: { flex: 1, height: 4, borderRadius: radii.pill },
  stepBarActive: { backgroundColor: colors.teal },
  stepBarCompleted: { backgroundColor: colors.teal },
  stepBarInactive: { backgroundColor: colors.surfaceAlt },
  stepWrap: { flex: 1, paddingBottom: spacing.xxl },
  heroSection: { alignItems: 'center', marginBottom: spacing.xl },
  logoBadge: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  heroTitle: { textAlign: 'center', marginBottom: spacing.xs },
  heroTagline: { textAlign: 'center' },
  pointsCard: { marginBottom: spacing.lg },
  pointRow: { flexDirection: 'row', alignItems: 'flex-start' },
  pointDivider: { marginTop: spacing.lg, paddingTop: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  pointIconCircle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
  pointTextWrap: { flex: 1 },
  stepTitle: { marginTop: spacing.xs, marginBottom: spacing.sm },
  stepDesc: { marginBottom: spacing.xl, lineHeight: 22 },
  configCard: { marginBottom: spacing.xl },
  fieldLabel: { marginBottom: spacing.sm },
  buttonRow: { flexDirection: 'row', gap: spacing.md },
  flexBtn: { flex: 1 },
  mbLg: { marginBottom: spacing.lg },
  mtXs: { marginTop: 4 },
  mtSm: { marginTop: spacing.sm },
  mtMd: { marginTop: spacing.md },
  mtLg: { marginTop: spacing.lg },
});
