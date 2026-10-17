import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, spacing } from '../config/theme';
import { ROUTES } from '../navigation/routes';
import { useQuery } from '../hooks/useQuery';
import { categoriesRepository } from '../database/repositories/categoriesRepository';
import AppText from '../components/common/AppText';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import CategoryIcon from '../components/CategoryIcon';
import EmptyState from '../components/common/EmptyState';
import Screen from '../components/common/Screen';
import Segmented from '../components/common/Segmented';

const KIND_LABELS = { expense: 'Gasto', income: 'Ingreso', both: 'Gasto e ingreso' };

export default function CATEGORIAS({ navigation }) {
  const [tab, setTab] = useState('expense');
  const { data: categories, loading, reload } = useQuery(
    db => categoriesRepository.list(db, { includeArchived: true }),
    [],
  );
  const visible = categories && categories.filter(c => tab === 'archived' ? c.status === 'archived' : c.status === 'active' && (c.kind === tab || c.kind === 'both'));

  return (
    <Screen onRefresh={reload} refreshing={loading}>
      <View style={styles.header}>
        <View style={styles.flex}>
          <AppText variant="title">Categorías</AppText>
          <AppText variant="caption" color={colors.textSecondary}>Organiza tus gastos e ingresos</AppText>
        </View>
        <Button title="Nueva categoría" icon="plus" small onPress={() => navigation.navigate(ROUTES.CATEGORIA_FORM)} />
      </View>
      <Segmented
        style={styles.segmented}
        options={[{ value: 'expense', label: 'Gastos' }, { value: 'income', label: 'Ingresos' }, { value: 'archived', label: 'Archivadas' }]}
        value={tab}
        onChange={setTab}
      />
      {visible && visible.length ? visible.map((category, index) => (
        <Card
          key={category.id}
          index={index}
          style={styles.card}
          onPress={() => navigation.navigate(ROUTES.CATEGORIA_FORM, { id: category.id })}
          accessibilityLabel={`Editar categoría ${category.name}`}>
          <View style={styles.row}>
            <CategoryIcon icon={category.icon} color={category.color} archived={category.status === 'archived'} />
            <View style={[styles.flex, styles.copy]}>
              <AppText variant="subtitle">{category.name}</AppText>
              <AppText variant="caption" color={colors.textSecondary}>
                {category.status === 'archived' ? 'Archivada' : KIND_LABELS[category.kind]}
              </AppText>
            </View>
            <AppText variant="caption" color={colors.textMuted}>Editar</AppText>
          </View>
        </Card>
      )) : visible ? (
        <EmptyState
          icon={tab === 'archived' ? 'archive' : 'dots'}
          title={tab === 'archived' ? 'No hay categorías archivadas' : 'Aún no hay categorías'}
          message={tab === 'archived' ? 'Las categorías archivadas conservan su historial.' : 'Crea una categoría para organizar tus movimientos.'}
          actionLabel={tab === 'archived' ? undefined : 'Crear una categoría'}
          onAction={() => navigation.navigate(ROUTES.CATEGORIA_FORM)}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg },
  flex: { flex: 1 },
  segmented: { marginBottom: spacing.lg },
  card: { marginBottom: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center' },
  copy: { marginLeft: spacing.md },
});
