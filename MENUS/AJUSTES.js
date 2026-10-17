/**
 * AJUSTES — periodo del círculo, seguridad, notificaciones, asistente y datos.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { colors, spacing } from '../config/theme';
import { BRAND } from '../config/brand';
import { ROUTES } from '../navigation/routes';
import { useDb } from '../hooks/DatabaseProvider';
import { useQuery } from '../hooks/useQuery';
import { useSettings } from '../hooks/useSettings';
import { getBiometricSupport, authenticate } from '../services/security/biometricService';
import { refreshScheduledNotifications } from '../services/notifications/notificationService';
import { assistantStatus, ASSISTANT_MODEL } from '../services/ai/assistantService';
import { getSyncAdapter } from '../services/sync/syncAdapter';
import { buildBackup } from '../services/csv/exportService';
import { saveTextFile, PickCancelled } from '../services/files/fileService';
import { describePeriod, getPeriod, PERIOD_LABELS } from '../utils/periods';
import { todayISO, WEEKDAYS_LONG } from '../utils/dates';
import AppText from '../components/common/AppText';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import DateTimeField from '../components/common/DateTimeField';
import Screen from '../components/common/Screen';
import SectionHeader from '../components/common/SectionHeader';
import Segmented from '../components/common/Segmented';
import SelectField from '../components/common/SelectField';
import TextField from '../components/common/TextField';
import { useToast } from '../components/common/Toast';

function Toggle({ title, subtitle, value, onChange, disabled }) {
  return (
    <View style={styles.toggle}>
      <View style={styles.flex}>
        <AppText color={disabled ? colors.textMuted : colors.text}>{title}</AppText>
        {subtitle ? <AppText variant="caption" color={colors.textSecondary} style={styles.sub}>{subtitle}</AppText> : null}
      </View>
      <Switch value={!!value} onValueChange={onChange} disabled={disabled} trackColor={{ true: colors.teal, false: colors.border }} thumbColor={colors.text} accessibilityLabel={title} />
    </View>
  );
}

const numberOptions = (from, to, fmt = n => String(n)) => Array.from({ length: to - from + 1 }, (_, i) => ({ value: from + i, label: fmt(from + i) }));

export default function AJUSTES({ navigation }) {
  const db = useDb();
  const toast = useToast();
  const { settings, update, periodSettings } = useSettings();
  const [bio, setBio] = useState(null);
  const [endpoint, setEndpoint] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const { data: ai } = useQuery(d => assistantStatus(d), []);
  const { data: pending } = useQuery(d => getSyncAdapter().pendingChanges(d), []);

  useEffect(() => {
    getBiometricSupport().then(setBio);
  }, []);
  useEffect(() => {
    if (settings) {
      setEndpoint(settings['ai.endpoint'] || '');
      setAccessToken(settings['ai.accessToken'] || '');
    }
  }, [settings]);
  if (!settings) return <Screen />;

  const set = async (values, msg) => {
    await update(values);
    if (msg) toast(msg);
  };
  const setNotif = async values => {
    await update(values);
    refreshScheduledNotifications(db).catch(() => {});
  };
  const period = getPeriod(todayISO(), periodSettings);

  const toggleBiometric = async on => {
    if (on) {
      const res = await authenticate('Confirma para activar el bloqueo');
      if (!res.success) {
        toast(res.unavailable ? 'Tu dispositivo no tiene biometría ni bloqueo de pantalla' : 'No se activó: autenticación cancelada', 'error');
        return;
      }
    }
    set({ 'security.biometricEnabled': on }, on ? 'Bloqueo activado' : 'Bloqueo desactivado');
  };

  const toggleNotifications = async on => {
    if (on) {
      const { localNotificationAdapter } = require('../services/notifications/localNotificationAdapter');
      const granted = await localNotificationAdapter.requestPermission();
      if (!granted) {
        toast('Android no concedió el permiso de notificaciones', 'error');
        return;
      }
    }
    await setNotif({ 'notifications.enabled': on });
    toast(on ? 'Notificaciones activadas' : 'Notificaciones desactivadas');
  };

  const exportBackup = async () => {
    try {
      const json = await buildBackup(db);
      await saveTextFile(`aurea-respaldo-${todayISO()}.json`, json, 'application/json');
      toast('Respaldo guardado donde elegiste');
    } catch (e) {
      if (!(e instanceof PickCancelled)) toast(e.message, 'error');
    }
  };

  const notifOn = !!settings['notifications.enabled'];
  return (
    <Screen>
      <SectionHeader title="Círculo de gasto" style={styles.first} />
      <Card>
        <SelectField label="Periodo" value={settings['period.type']} onChange={v => set({ 'period.type': v })} options={Object.entries(PERIOD_LABELS).map(([value, label]) => ({ value, label }))} />
        {settings['period.type'] === 'weekly' ? (
          <SelectField label="La semana empieza en" value={settings['period.weekStartDay']} onChange={v => set({ 'period.weekStartDay': v })} options={WEEKDAYS_LONG.map((d, i) => ({ value: i, label: d[0].toUpperCase() + d.slice(1) }))} />
        ) : null}
        {settings['period.type'] === 'biweekly' ? (
          <>
            <Segmented options={[{ value: 'calendar', label: '1–15 y 16–fin' }, { value: 'anchor', label: 'Cada 14 días' }]} value={settings['period.biweeklyMode']} onChange={v => set({ 'period.biweeklyMode': v, ...(v === 'anchor' && !settings['period.biweeklyAnchor'] ? { 'period.biweeklyAnchor': todayISO() } : {}) })} style={styles.mb} />
            {settings['period.biweeklyMode'] === 'anchor' ? <DateTimeField label="Fecha de referencia (inicio de una quincena)" mode="date" value={settings['period.biweeklyAnchor'] || todayISO()} onChange={v => set({ 'period.biweeklyAnchor': v })} /> : null}
          </>
        ) : null}
        {settings['period.type'] === 'monthly' ? (
          <SelectField label="El mes empieza el día" value={settings['period.monthStartDay']} onChange={v => set({ 'period.monthStartDay': v })} options={numberOptions(1, 28)} hint="Útil si cobras a mitad de mes." />
        ) : null}
        {settings['period.type'] === 'custom' ? (
          <View style={styles.row}>
            <View style={styles.flex}><DateTimeField label="Desde" mode="date" value={settings['period.customStart'] || todayISO()} onChange={v => set({ 'period.customStart': v })} /></View>
            <View style={styles.flex}><DateTimeField label="Hasta" mode="date" value={settings['period.customEnd'] || todayISO()} onChange={v => set({ 'period.customEnd': v })} /></View>
          </View>
        ) : null}
        <AppText variant="caption" color={colors.textMuted}>Periodo actual: {describePeriod(period)}{period.invalid ? ' (rango personalizado incompleto: se usa el mes)' : ''}</AppText>
        <AppText variant="caption" color={colors.textSecondary} style={[styles.label, styles.mtLg]}>Restante calculado sobre</AppText>
        <Segmented options={[{ value: 'auto', label: 'Automático' }, { value: 'income', label: 'Ingresos' }, { value: 'budget', label: 'Presupuesto' }]} value={settings['circle.remainingBase']} onChange={v => set({ 'circle.remainingBase': v })} />
        <AppText variant="caption" color={colors.textMuted} style={styles.mt}>
          Automático usa tu presupuesto general del periodo si existe; si no, los ingresos recibidos; si no, los previstos (estimación). El restante del periodo es distinto de tu saldo en cuentas.
        </AppText>
      </Card>

      <SectionHeader title="Seguridad" />
      <Card>
        <Toggle
          title="Bloqueo con biometría"
          subtitle={bio ? (bio.available ? 'Huella o rostro del sistema. Si falla, puedes usar el PIN/patrón del teléfono.' : bio.deviceSecure ? 'Sin biometría: se usará el PIN/patrón del teléfono.' : 'Este dispositivo no tiene biometría ni bloqueo de pantalla.') : 'Comprobando…'}
          value={settings['security.biometricEnabled']}
          onChange={toggleBiometric}
          disabled={!bio || (!bio.available && !bio.deviceSecure)}
        />
        {settings['security.biometricEnabled'] ? (
          <SelectField label="Pedir de nuevo tras estar en segundo plano" value={settings['security.graceSeconds']} onChange={v => set({ 'security.graceSeconds': v })} options={[0, 30, 60, 300, 900].map(s => ({ value: s, label: s === 0 ? 'Inmediatamente' : s < 60 ? `${s} segundos` : `${s / 60} minuto${s > 60 ? 's' : ''}` }))} />
        ) : null}
        <AppText variant="caption" color={colors.textMuted}>La app nunca guarda huellas ni imágenes: solo recibe del sistema si la autenticación tuvo éxito. Los importes no se ocultan una vez desbloqueada.</AppText>
      </Card>

      <SectionHeader title="Notificaciones" />
      <Card>
        <Toggle title="Activar notificaciones locales" subtitle="Funcionan sin conexión y sin cuentas externas." value={notifOn} onChange={toggleNotifications} />
        <Toggle title="Alertas de presupuesto" value={settings['notifications.budget']} onChange={v => setNotif({ 'notifications.budget': v })} disabled={!notifOn} />
        <Toggle title="Restante bajo del periodo" subtitle={`Cuando quede ${settings['notifications.lowRemainingPercent']}% o menos`} value={settings['notifications.lowRemaining']} onChange={v => setNotif({ 'notifications.lowRemaining': v })} disabled={!notifOn} />
        {notifOn && settings['notifications.lowRemaining'] ? <SelectField label="Umbral de restante bajo" value={settings['notifications.lowRemainingPercent']} onChange={v => setNotif({ 'notifications.lowRemainingPercent': v })} options={[10, 15, 20, 25, 30, 40].map(n => ({ value: n, label: `${n}%` }))} /> : null}
        <Toggle title="Vencimiento de tarjetas" value={settings['notifications.cardDue']} onChange={v => setNotif({ 'notifications.cardDue': v })} disabled={!notifOn} />
        <Toggle title="Pagos de financiaciones" value={settings['notifications.debtDue']} onChange={v => setNotif({ 'notifications.debtDue': v })} disabled={!notifOn} />
        <Toggle title="Ingresos esperados" value={settings['notifications.expectedIncome']} onChange={v => setNotif({ 'notifications.expectedIncome': v })} disabled={!notifOn} />
        <Toggle title="Gastos recurrentes próximos" value={settings['notifications.recurringExpense']} onChange={v => setNotif({ 'notifications.recurringExpense': v })} disabled={!notifOn} />
        <Toggle title="Recordatorio diario para registrar gastos" value={settings['notifications.dailyReminder']} onChange={v => setNotif({ 'notifications.dailyReminder': v })} disabled={!notifOn} />
        {notifOn ? (
          <View style={styles.row}>
            <View style={styles.flex}><SelectField label="Avisar con" value={settings['notifications.daysBefore']} onChange={v => setNotif({ 'notifications.daysBefore': v })} options={[0, 1, 2, 3, 5, 7].map(n => ({ value: n, label: n === 0 ? 'El mismo día' : `${n} día${n > 1 ? 's' : ''} antes` }))} /></View>
            <View style={styles.flex}><SelectField label="A las" value={settings['notifications.hour']} onChange={v => setNotif({ 'notifications.hour': v })} options={numberOptions(6, 22, h => `${h}:00`)} /></View>
          </View>
        ) : null}
        {notifOn && settings['notifications.dailyReminder'] ? <SelectField label="Hora del recordatorio diario" value={settings['notifications.dailyReminderHour']} onChange={v => setNotif({ 'notifications.dailyReminderHour': v })} options={numberOptions(12, 23, h => `${h}:00`)} /> : null}
      </Card>

      <SectionHeader title="Accesibilidad" />
      <Card>
        <Toggle title="Reducir movimiento" subtitle="Desactiva las transiciones entre pantallas. Las animaciones también respetan el ajuste del sistema." value={settings['ui.reduceMotion']} onChange={v => set({ 'ui.reduceMotion': v })} />
      </Card>

      <SectionHeader title="Asistente con IA (opcional)" />
      <Card>
        <Toggle title="Permitir preguntas libres con IA" subtitle={`Modelo previsto: Claude Haiku 5.5 (${ASSISTANT_MODEL}) en tu propio servidor. Solo se envían totales agregados, nunca movimientos individuales.`} value={settings['ai.enabled']} onChange={v => set({ 'ai.enabled': v })} />
        <TextField label="URL de tu servidor (https)" value={endpoint} onChangeText={setEndpoint} onBlur={() => set({ 'ai.endpoint': endpoint.trim() })} autoCapitalize="none" keyboardType="url" placeholder="https://tu-funcion.ejemplo.com/asistente" hint="La clave de Anthropic vive en ese servidor, nunca en la app. Ver docs/INTEGRACIONES.md." />
        <TextField label="Token de acceso de tu servidor" value={accessToken} onChangeText={setAccessToken} onBlur={() => set({ 'ai.accessToken': accessToken.trim() })} autoCapitalize="none" secureTextEntry placeholder="Opcional" hint="Lo defines tú en tu servidor para que nadie más use tu cuota. No es la clave de Anthropic." />
        <View style={styles.row}>
          <View style={styles.flex}><SelectField label="Consultas al mes" value={settings['ai.monthlyRequestLimit']} onChange={v => set({ 'ai.monthlyRequestLimit': v })} options={[10, 30, 60, 100].map(n => ({ value: n, label: String(n) }))} /></View>
          <View style={styles.flex}><SelectField label="Longitud máx." value={settings['ai.maxResponseTokens']} onChange={v => set({ 'ai.maxResponseTokens': v })} options={[{ value: 150, label: 'Muy breve' }, { value: 300, label: 'Breve' }, { value: 600, label: 'Media' }]} /></View>
        </View>
        {ai ? <AppText variant="caption" color={ai.nearLimit ? colors.gold : colors.textMuted}>Usadas este mes: {ai.used} de {ai.limit}{ai.nearLimit ? ' · cerca del límite' : ''}{!ai.configured ? ' · servidor sin configurar' : ''}</AppText> : null}
      </Card>

      <SectionHeader title="Datos" />
      <Card>
        <Button title="Exportar respaldo completo (JSON)" icon="download" variant="secondary" onPress={exportBackup} />
        <Button title="Importar / exportar movimientos CSV" icon="upload" variant="secondary" onPress={() => navigation.navigate(ROUTES.IMPORTAR_CSV)} style={styles.mt} />
        <AppText variant="caption" color={colors.textMuted} style={styles.mt}>
          El respaldo contiene todos tus datos financieros sin cifrar: guárdalo en un lugar privado. Tú eliges dónde se guarda; la app no lo sube a ningún sitio.
        </AppText>
        <AppText variant="caption" color={colors.textMuted} style={styles.mt}>
          Sincronización en la nube: no configurada. Los datos viven solo en este teléfono ({pending ?? 0} cambios registrados para una futura sincronización).
        </AppText>
      </Card>
      <AppText variant="caption" color={colors.textMuted} style={styles.footer}>{BRAND.name} · sin analítica ni rastreo · iconos: Lucide (ISC) y Dashboard Icons</AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  first: { marginTop: 0 },
  label: { marginBottom: 8 },
  toggle: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, marginBottom: spacing.sm, gap: spacing.md },
  flex: { flex: 1 },
  sub: { marginTop: 2 },
  row: { flexDirection: 'row', gap: spacing.md },
  mb: { marginBottom: spacing.lg },
  mt: { marginTop: spacing.sm },
  mtLg: { marginTop: spacing.lg },
  footer: { textAlign: 'center', marginTop: spacing.xxl },
});
