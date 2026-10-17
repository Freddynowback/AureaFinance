/**
 * ASISTENTE — asistente financiero opcional con respuestas deterministas
 * locales y preguntas libres vía backend propio con IA.
 */
import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { colors, radii, spacing } from '../config/theme';
import { ROUTES } from '../navigation/routes';
import { useDb } from '../hooks/DatabaseProvider';
import { useQuery } from '../hooks/useQuery';
import { useSettings } from '../hooks/useSettings';
import { useToast } from '../components/common/Toast';
import { getPeriodSummary } from '../services/stats/summaryService';
import { compareWithPrevious } from '../services/stats/statsService';
import { listBudgetStatus } from '../services/budgets/budgetService';
import { getUpcoming } from '../services/stats/upcomingService';
import { listDebts } from '../services/debts/debtService';
import { buildPlan } from '../services/debts/recommender';
import { QUICK_QUESTIONS, answerLocally } from '../services/ai/insightsEngine';
import { assistantStatus, askAssistant } from '../services/ai/assistantService';
import { todayISO } from '../utils/dates';
import AppText from '../components/common/AppText';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import Chip from '../components/common/Chip';
import Icon from '../components/common/Icon';
import Screen from '../components/common/Screen';
import SectionHeader from '../components/common/SectionHeader';
import TextField from '../components/common/TextField';

async function loadAssistant(db, { periodSettings, remainingMode }) {
  const today = todayISO();
  const [summary, upcomingData, budgets, debts, aiStatus] = await Promise.all([
    getPeriodSummary(db, { periodSettings, remainingMode }),
    getUpcoming(db),
    listBudgetStatus(db, periodSettings),
    listDebts(db),
    assistantStatus(db),
  ]);

  const comparison = summary?.period ? await compareWithPrevious(db, summary.period, periodSettings) : null;

  // Deuda activa con effectiveDueDate más próxima y outstanding > 0
  const activeDebts = (debts || [])
    .filter(d => (d.status === 'active' || !d.status) && d.effectiveDueDate && d.outstanding > 0)
    .sort((a, b) => a.effectiveDueDate.localeCompare(b.effectiveDueDate));
  const candidateDebt = activeDebts[0];
  const debtPlan = candidateDebt
    ? {
        name: candidateDebt.name,
        ...buildPlan({
          outstanding: candidateDebt.outstanding,
          reserved: candidateDebt.reserved || 0,
          today,
          deadline: candidateDebt.effectiveDueDate,
          frequency: 'weekly',
        }),
      }
    : null;

  // Tarjeta de crédito con debt > 0 y nextDue más próximo
  const creditCards = (upcomingData?.overview?.accounts || [])
    .filter(a => a.type === 'credit' && a.debt > 0 && a.nextDue)
    .sort((a, b) => a.nextDue.localeCompare(b.nextDue));
  const candidateCard = creditCards[0];
  const cardPlan = candidateCard
    ? {
        name: candidateCard.name,
        ...buildPlan({
          outstanding: candidateCard.debt,
          reserved: 0,
          today,
          deadline: candidateCard.nextDue,
          frequency: 'weekly',
        }),
      }
    : null;

  const ctx = {
    summary,
    comparison,
    budgets,
    upcoming: upcomingData?.items || [],
    debtPlan,
    cardPlan,
  };

  return { ctx, aiStatus };
}

export default function ASISTENTE({ navigation }) {
  const db = useDb();
  const toast = useToast();
  const { settings, periodSettings } = useSettings();

  const [conversation, setConversation] = useState([]);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [statusOverride, setStatusOverride] = useState(null);

  const { data, loading, reload } = useQuery(
    d =>
      periodSettings
        ? loadAssistant(d, {
            periodSettings,
            remainingMode: settings && settings['circle.remainingBase'],
          })
        : Promise.resolve(null),
    [periodSettings, settings && settings['circle.remainingBase']],
  );

  const currentStatus = statusOverride || data?.aiStatus;

  const handleQuickQuestion = useCallback(
    q => {
      if (!data?.ctx) return;
      const answer = answerLocally(q.id, data.ctx);
      setConversation(prev => [
        ...prev,
        {
          id: `local-${Date.now()}-${Math.random()}`,
          question: q.text,
          answer: answer || 'Sin información suficiente para responder en este momento.',
          tag: 'Calculado en tu teléfono',
          isAi: false,
        },
      ]);
    },
    [data?.ctx],
  );

  const handleAskAssistant = useCallback(async () => {
    const q = question.trim();
    if (!q) {
      toast('Escribe una pregunta para el asistente', 'warning');
      return;
    }
    if (!data?.ctx) return;
    setAsking(true);
    try {
      const res = await askAssistant(db, q, data.ctx);
      setConversation(prev => [
        ...prev,
        {
          id: `ai-${Date.now()}-${Math.random()}`,
          question: q,
          answer: res.answer,
          tag: 'Respuesta de IA · revisa las cifras',
          isAi: true,
        },
      ]);
      setQuestion('');
      const updatedStatus = await assistantStatus(db);
      setStatusOverride(updatedStatus);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setAsking(false);
    }
  }, [db, question, data?.ctx, toast]);

  if (!settings || !periodSettings) return <Screen />;

  const isConfiguredAndEnabled = currentStatus?.enabled && currentStatus?.configured;

  return (
    <Screen onRefresh={reload} refreshing={loading}>
      {/* Explicación breve arriba */}
      <Card index={0} style={styles.topCard}>
        <View style={styles.badgeRow}>
          <Icon name="spark" size={18} color={colors.teal} />
          <AppText variant="subtitle" style={styles.mlSm}>Asistente financiero</AppText>
        </View>
        <AppText variant="body" color={colors.textSecondary} style={styles.mtSm}>
          Las respuestas rápidas se calculan en el teléfono sin conexión ni coste.
        </AppText>
        <AppText variant="caption" color={colors.textMuted} style={styles.mtXs}>
          La IA (Claude Haiku 5.5 vía tu servidor) es opcional, está desactivada por defecto y solo recibe totales agregados.
        </AppText>
      </Card>

      {/* Preguntas rápidas */}
      <SectionHeader title="Preguntas rápidas" />
      <View style={styles.chipsWrap}>
        {QUICK_QUESTIONS.map(q => (
          <Chip key={q.id} label={q.text} onPress={() => handleQuickQuestion(q)} />
        ))}
      </View>

      {/* Pregunta libre (IA) */}
      <SectionHeader title="Pregunta libre (IA)" />
      {!isConfiguredAndEnabled ? (
        <Card index={1} style={styles.aiStatusCard}>
          <View style={styles.row}>
            <Icon name="info" size={20} color={colors.gold} />
            <View style={[styles.flex, styles.mlSm]}>
              <AppText variant="subtitle" color={colors.text}>
                {!currentStatus?.enabled
                  ? 'Asistente de IA desactivado'
                  : 'Asistente no configurado'}
              </AppText>
              <AppText variant="small" color={colors.textSecondary} style={styles.mtXs}>
                {!currentStatus?.enabled
                  ? 'La IA está desactivada por defecto para proteger tu privacidad. Puedes activarla en Ajustes.'
                  : 'Falta configurar la URL https de tu servidor de IA en Ajustes.'}
              </AppText>
            </View>
          </View>
          <Button
            title="Ir a Ajustes"
            variant="secondary"
            onPress={() => navigation.navigate(ROUTES.AJUSTES)}
            style={styles.mtMd}
          />
        </Card>
      ) : (
        <Card index={1} style={styles.aiFormCard}>
          <View style={styles.usageRow}>
            <AppText variant="caption" color={colors.textSecondary}>
              {currentStatus?.limit > 0
                ? `Uso este mes: ${currentStatus.used} / ${currentStatus.limit} consultas`
                : `Uso este mes: ${currentStatus.used || 0} consultas`}
            </AppText>
            {currentStatus?.nearLimit && !currentStatus?.exhausted ? (
              <View style={styles.warningPill}>
                <Icon name="alert" size={13} color={colors.gold} />
                <AppText variant="caption" color={colors.gold} style={styles.mlXs}>
                  Cerca del límite
                </AppText>
              </View>
            ) : null}
            {currentStatus?.exhausted ? (
              <View style={styles.errorPill}>
                <Icon name="alert" size={13} color={colors.coral} />
                <AppText variant="caption" color={colors.coral} style={styles.mlXs}>
                  Límite alcanzado
                </AppText>
              </View>
            ) : null}
          </View>

          <TextField
            label="Tu pregunta"
            placeholder="Pregunta sobre tus gastos, ahorros o presupuestos..."
            value={question}
            onChangeText={setQuestion}
            multiline
            editable={!asking && !currentStatus?.exhausted}
            style={styles.mtSm}
          />

          <Button
            title="Enviar"
            icon="spark"
            onPress={handleAskAssistant}
            loading={asking}
            disabled={!question.trim() || asking || currentStatus?.exhausted}
          />
        </Card>
      )}

      {/* Lista de conversación */}
      {conversation.length ? (
        <>
          <SectionHeader
            title="Conversación"
            action="Limpiar"
            onAction={() => setConversation([])}
          />
          {conversation.map((item, idx) => (
            <Animated.View key={item.id} entering={FadeInDown.duration(280)}>
              <Card index={idx + 2} style={styles.convCard}>
                <View style={styles.questionBox}>
                  <AppText variant="subtitle" color={colors.text}>
                    {item.question}
                  </AppText>
                </View>
                <AppText variant="body" color={colors.textSecondary} style={styles.answerText}>
                  {item.answer}
                </AppText>
                <View style={styles.tagRow}>
                  <View style={[styles.tagBadge, item.isAi ? styles.tagAi : styles.tagLocal]}>
                    <Icon
                      name={item.isAi ? 'spark' : 'bolt'}
                      size={12}
                      color={item.isAi ? colors.violet : colors.teal}
                    />
                    <AppText
                      variant="caption"
                      color={item.isAi ? colors.violet : colors.teal}
                      style={styles.mlXs}>
                      {item.tag}
                    </AppText>
                  </View>
                </View>
              </Card>
            </Animated.View>
          ))}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topCard: { marginBottom: spacing.sm },
  badgeRow: { flexDirection: 'row', alignItems: 'center' },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.xs },
  aiStatusCard: { marginBottom: spacing.md },
  aiFormCard: { marginBottom: spacing.md },
  usageRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  warningPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.goldSoft, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radii.pill },
  errorPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.coralSoft, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radii.pill },
  convCard: { marginBottom: spacing.md },
  questionBox: { marginBottom: spacing.sm },
  answerText: { lineHeight: 22 },
  tagRow: { marginTop: spacing.md, flexDirection: 'row', justifyContent: 'flex-start' },
  tagBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radii.pill, borderWidth: 1 },
  tagLocal: { backgroundColor: colors.tealSoft, borderColor: colors.teal },
  tagAi: { backgroundColor: colors.violetSoft, borderColor: colors.violet },
  row: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
  mlXs: { marginLeft: 4 },
  mlSm: { marginLeft: spacing.sm },
  mtXs: { marginTop: 4 },
  mtSm: { marginTop: spacing.sm },
  mtMd: { marginTop: spacing.md },
});
