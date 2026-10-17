import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, spacing } from '../config/theme';
import { ROUTES } from '../navigation/routes';
import { useSettings } from '../hooks/useSettings';
import { useQuery } from '../hooks/useQuery';
import { listBudgetStatus } from '../services/budgets/budgetService';
import AppText from '../components/common/AppText';
import BudgetProgress from '../components/BudgetProgress';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import EmptyState from '../components/common/EmptyState';
import Screen from '../components/common/Screen';

export default function PRESUPUESTOS({ navigation }) {
  const { periodSettings } = useSettings();
  const { data: budgets, loading, reload } = useQuery(
    db => periodSettings ? listBudgetStatus(db, periodSettings) : Promise.resolve(null),
    [periodSettings],
  );
  return (
    <Screen onRefresh={reload} refreshing={loading}>
      <View style={styles.header}>
        <View style={styles.flex}><AppText variant="caption" color={colors.textSecondary}>Controla tus límites de gasto</AppText></View>
        <Button title="Nuevo presupuesto" icon="plus" small onPress={() => navigation.navigate(ROUTES.PRESUPUESTO_FORM)} />
      </View>
      {budgets && budgets.length ? budgets.map((budget, index) => (
        <Card key={budget.id} index={index} style={styles.card} onPress={() => navigation.navigate(ROUTES.PRESUPUESTO_FORM, { id: budget.id })} accessibilityLabel={`Editar presupuesto ${budget.category_name || 'general'}`}>
          <BudgetProgress budget={budget} />
        </Card>
      )) : budgets ? (
        <EmptyState icon="chart" title="Aún no tienes presupuestos" message="Define un límite para recibir una señal cuando te acerques a él." actionLabel="Crear un presupuesto" onAction={() => navigation.navigate(ROUTES.PRESUPUESTO_FORM)} />
      ) : null}
      <AppText variant="caption" color={colors.textMuted} style={styles.note}>Superar un presupuesto no bloquea el registro de gastos.</AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
  flex: { flex: 1 },
  card: { marginBottom: spacing.md },
  note: { textAlign: 'center', marginTop: spacing.lg },
});
