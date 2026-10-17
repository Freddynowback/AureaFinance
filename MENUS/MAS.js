/**
 * MAS — acceso a las secciones secundarias.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { colors, spacing } from '../config/theme';
import { BRAND } from '../config/brand';
import { ROUTES } from '../navigation/routes';
import AppText from '../components/common/AppText';
import Card from '../components/common/Card';
import ListRow from '../components/common/ListRow';
import Screen from '../components/common/Screen';
import SectionHeader from '../components/common/SectionHeader';

const SECTIONS = [
  {
    title: 'Dinero',
    items: [
      { route: ROUTES.CUENTAS, icon: 'wallet', color: colors.teal, title: 'Cuentas', subtitle: 'Efectivo, débito, ahorro y tarjetas' },
      { route: ROUTES.INGRESOS, icon: 'salary', color: colors.positive, title: 'Ingresos y recurrencias', subtitle: 'Salario, cobros previstos y pagos fijos' },
      { route: ROUTES.PRESUPUESTOS, icon: 'target', color: colors.gold, title: 'Presupuestos', subtitle: 'Límites por periodo y categoría' },
      { route: ROUTES.METAS, icon: 'piggy', color: colors.violet, title: 'Metas de ahorro', subtitle: 'Objetivos, aportaciones y reservas' },
      { route: ROUTES.CATEGORIAS, icon: 'list', color: colors.info, title: 'Categorías', subtitle: 'Colores, iconos y archivo' },
    ],
  },
  {
    title: 'Herramientas',
    items: [
      { route: ROUTES.IMPORTAR_CSV, icon: 'upload', color: colors.teal, title: 'Importar y exportar CSV', subtitle: 'Estados de cuenta, respaldo' },
      { route: ROUTES.ASISTENTE, icon: 'bot', color: colors.violet, title: 'Asistente', subtitle: 'Respuestas rápidas sobre tus finanzas' },
      { route: ROUTES.AJUSTES, icon: 'settings', color: colors.textSecondary, title: 'Ajustes', subtitle: 'Periodo, seguridad, notificaciones' },
    ],
  },
];

export default function MAS({ navigation }) {
  return (
    <Screen>
      {SECTIONS.map((s, si) => (
        <React.Fragment key={s.title}>
          <SectionHeader title={s.title} style={si === 0 ? styles.first : null} />
          <Card index={si} style={styles.card}>
            {s.items.map((it, i) => (
              <ListRow key={it.route} icon={it.icon} iconColor={it.color} title={it.title} subtitle={it.subtitle} onPress={() => navigation.navigate(it.route)} last={i === s.items.length - 1} />
            ))}
          </Card>
        </React.Fragment>
      ))}
      <AppText variant="caption" color={colors.textMuted} style={styles.footer}>
        {BRAND.name} · tus datos se guardan solo en este dispositivo
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  first: { marginTop: 0 },
  card: { paddingVertical: spacing.xs },
  footer: { textAlign: 'center', marginTop: spacing.xxl },
});
